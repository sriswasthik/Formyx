import {
  apiErrorSchema,
  createEmptyForm,
  createField,
  pinCodeLookupSchema,
  uploadSignatureSchema,
  type Field,
  type FieldOfType,
  type FormSchema,
} from '@formyx/shared';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinCodeService } from '../services/pin-code-service.js';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createFakeCloudinary } from '../test/fake-cloudinary.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const cloud = createFakeCloudinary();
const app = createTestApp({}, { storage: cloud.storage });
let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
  vi.unstubAllGlobals();
});

const silent = pino({ level: 'silent' });
const indiaPost = (district: string, state: string) =>
  Response.json([
    {
      Status: 'Success',
      PostOffice: [{ Name: 'MG Road', District: district, State: state }],
    },
  ]);

describe('PIN code lookups', () => {
  it('answers city and state, caching them', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(indiaPost('Bengaluru', 'Karnataka')));
    const service = createPinCodeService({
      baseUrl: 'https://postal.test/pincode',
      logger: silent,
      fetch: fetchMock,
    });
    expect(await service.lookup('560001')).toEqual({
      pin: '560001',
      city: 'Bengaluru',
      state: 'Karnataka',
    });
    await service.lookup('560001');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://postal.test/pincode/560001', expect.anything());
  });

  it('remembers unknown PIN codes for a day, and lookups that failed not at all', async () => {
    let now = 0;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([{ Status: 'Error', PostOffice: null }]))
      .mockRejectedValueOnce(new Error('down'))
      .mockImplementation(() => Promise.resolve(indiaPost('Mumbai', 'Maharashtra')));
    const service = createPinCodeService({
      baseUrl: 'https://postal.test/pincode',
      logger: silent,
      fetch: fetchMock,
      now: () => now,
    });
    expect(await service.lookup('999999')).toBeNull();
    expect(await service.lookup('999999')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(service.lookup('400001')).rejects.toThrow('down');
    expect(await service.lookup('400001')).toMatchObject({ city: 'Mumbai' });

    now += 25 * 60 * 60 * 1000;
    await service.lookup('999999');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('keeps the cache to its size, dropping the least recently used', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(indiaPost('X', 'Y')));
    const service = createPinCodeService({
      baseUrl: 'https://postal.test',
      logger: silent,
      fetch: fetchMock,
      maxEntries: 2,
    });
    await service.lookup('110001');
    await service.lookup('110002');
    await service.lookup('110001');
    await service.lookup('110003');
    await service.lookup('110001');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await service.lookup('110002');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('serves lookups publicly, cacheable, and turns away bad PIN codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(indiaPost('Chennai', 'Tamil Nadu'))),
    );
    const res = await request(app).get('/api/public/pincodes/600001').expect(200);
    expect(pinCodeLookupSchema.parse(res.body)).toEqual({
      pin: '600001',
      city: 'Chennai',
      state: 'Tamil Nadu',
    });
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    await request(app).get('/api/public/pincodes/012345').expect(400);
  });

  it('says when India Post is unreachable, so respondents type it in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('timeout'))),
    );
    const res = await request(app).get('/api/public/pincodes/700001').expect(503);
    expect(apiErrorSchema.parse(res.body).error.message).toMatch(/cannot be looked up/);
  });
});

function schemaWith(...fields: Field[]): FormSchema {
  return { ...createEmptyForm(), fields };
}

describe('signatures and voice notes', () => {
  const signature = { ...createField('signature'), label: 'Sign here', required: true };
  const voice = { ...createField('voice_note'), label: 'Tell us more' };

  it('signs uploads for them with their own formats and limits', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, schemaWith(signature, voice));
    const sign = async (field: string) =>
      uploadSignatureSchema.parse(
        (
          await request(app)
            .get('/api/uploads/signature')
            .query({ purpose: 'answer', form: form.slug, field })
            .expect(200)
        ).body,
      );
    expect(await sign(signature.id)).toMatchObject({ allowedFormats: 'png', maxBytes: 1048576 });
    expect((await sign(voice.id)).allowedFormats).toContain('webm');
  });

  it('checks them against storage when the response arrives', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, schemaWith(signature, voice));
    const drawn = cloud.upload(`formyx/forms/${form.id}/${signature.id}`, {
      name: 'signature.png',
      bytes: 3000,
      format: 'png',
    });
    const recorded = cloud.upload(`formyx/forms/${form.id}/${voice.id}`, {
      name: 'voice-note.webm',
      bytes: 50_000,
      format: 'webm',
    });
    await request(app)
      .post(`/api/public/forms/${form.slug}/submissions`)
      .send({ answers: { [signature.id]: drawn, [voice.id]: recorded } })
      .expect(201);

    const elsewhere = cloud.upload('formyx/forms/other/x', {
      name: 'signature.png',
      bytes: 3000,
      format: 'png',
    });
    await request(app)
      .post(`/api/public/forms/${form.slug}/submissions`)
      .send({ answers: { [signature.id]: elsewhere } })
      .expect(400);
  });
});

describe('pictures in questions', () => {
  async function draft(editor: ReturnType<typeof requestAs>) {
    const res = await editor.post(`/api/workspaces/${team.workspaceId}/forms`, {}).expect(201);
    return res.body as { id: string; version: number };
  }

  it('takes pictures uploaded for the form, and refuses others', async () => {
    const editor = requestAs(app, team.users.EDITOR);
    const form = await draft(editor);
    const picture = cloud.upload(`formyx/themes/${form.id}`, {
      name: 'cat.png',
      bytes: 2000,
      format: 'png',
    });
    const pictures: FieldOfType<'picture_choice'> = {
      ...createField('picture_choice'),
      options: [{ id: 'cat', label: 'Cat', imageUrl: picture.url }],
    };
    await editor
      .patch(`/api/forms/${form.id}`, { version: form.version, draftSchema: schemaWith(pictures) })
      .expect(200);

    const stranger = cloud.upload('formyx/themes/form_other', {
      name: 'dog.png',
      bytes: 2000,
      format: 'png',
    });
    const image = { ...createField('image'), imageUrl: stranger.url, alt: 'A dog' };
    const res = await editor
      .patch(`/api/forms/${form.id}`, {
        version: form.version + 1,
        draftSchema: schemaWith(pictures, image),
      })
      .expect(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('the CSV export with the new question types', () => {
  it('splits matrices, addresses and date ranges into columns', async () => {
    const matrix: FieldOfType<'matrix'> = {
      ...createField('matrix'),
      label: 'Rate',
      rows: [
        { id: 'food', label: 'Food' },
        { id: 'service', label: 'Service' },
      ],
      columns: [
        { id: 'poor', label: 'Poor' },
        { id: 'good', label: 'Good' },
      ],
    };
    const address = { ...createField('address'), label: 'Address' };
    const stay = { ...createField('date_range'), label: 'Stay' };
    const nps = { ...createField('nps'), label: 'Recommend' };
    const form = await createPublishedForm(
      prisma,
      team.workspaceId,
      schemaWith(matrix, address, stay, nps),
    );
    await request(app)
      .post(`/api/public/forms/${form.slug}/submissions`)
      .send({
        answers: {
          [matrix.id]: { food: 'good', service: 'poor' },
          [address.id]: {
            line1: '1 MG Road',
            line2: '',
            pin: '560001',
            city: 'Bengaluru',
            state: 'Karnataka',
          },
          [stay.id]: { start: '2026-10-01', end: '2026-10-03' },
          [nps.id]: 9,
        },
      })
      .expect(201);

    const res = await requestAs(app, team.users.VIEWER)
      .get(`/api/forms/${form.id}/submissions/export`)
      .expect(200);
    const [header, row] = res.text.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(header).toBe(
      'Response ID,Submitted at (UTC),Rate: Food,Rate: Service,Address (Address line 1),' +
        'Address (Address line 2),Address (PIN code),Address (City),Address (State),' +
        'Stay (start),Stay (end),Recommend,Time to complete (seconds)',
    );
    expect(row).toMatch(
      /,Good,Poor,1 MG Road,,560001,Bengaluru,Karnataka,2026-10-01,2026-10-03,9,$/,
    );
  });
});
