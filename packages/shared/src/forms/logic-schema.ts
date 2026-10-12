import { z } from 'zod';
import { conditionMatchSchema, conditionOperatorSchema } from './conditions.js';
import { NODE_ID_PATTERN } from './ids.js';

/*
 * Form logic beyond showing and hiding questions (schema v3): where each page leads, values
 * calculated from answers, quiz answers and the end screens. The functions that run it are
 * in `src/logic`.
 */

export const MAX_JUMPS_PER_PAGE = 20;
export const MAX_LOGIC_CONDITIONS = 20;
export const MAX_VARIABLES = 20;
export const MAX_RULES = 200;
export const MAX_END_SCREENS = 20;
export const MAX_REDIRECT_PARAMS = 20;

/** The first page starts at the top of the form, with no page break; this is its key. */
export const START_PAGE_KEY = 'start';

/** What a quiz adds for end screens: points scored, and that as a share of those possible. */
export const QUIZ_SCORE_VARIABLE = 'quiz_score';
export const QUIZ_PERCENT_VARIABLE = 'quiz_percent';
export const QUIZ_VARIABLES: readonly string[] = [QUIZ_SCORE_VARIABLE, QUIZ_PERCENT_VARIABLE];

const nodeId = z.string().regex(NODE_ID_PATTERN, 'Use letters, numbers, - and _ only');
const number = z
  .number()
  .refine(Number.isFinite, 'Enter a number')
  .refine((value) => Math.abs(value) <= 1_000_000_000, 'Use a smaller number');

/** "If the answer to … is …", as questions' own conditions are. */
export const answerConditionSchema = z.object({
  kind: z.literal('answer'),
  sourceFieldId: nodeId,
  operator: conditionOperatorSchema,
  value: z.union([z.string().max(500), z.number()]).optional(),
});

export const VARIABLE_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'at_least',
  'less_than',
  'at_most',
] as const;
export const variableOperatorSchema = z.enum(VARIABLE_OPERATORS);
export type VariableOperator = z.infer<typeof variableOperatorSchema>;

/** "If score is at least 10". */
export const variableConditionSchema = z.object({
  kind: z.literal('variable'),
  variableId: nodeId,
  operator: variableOperatorSchema,
  value: number.optional(),
});

/** "If the quiz was passed": end screens only, as only the server can mark a quiz. */
export const quizConditionSchema = z.object({
  kind: z.literal('quiz'),
  result: z.enum(['passed', 'failed']),
});

export const logicConditionSchema = z.discriminatedUnion('kind', [
  answerConditionSchema,
  variableConditionSchema,
  quizConditionSchema,
]);
export type LogicCondition = z.infer<typeof logicConditionSchema>;
export type AnswerCondition = z.infer<typeof answerConditionSchema>;
export type VariableCondition = z.infer<typeof variableConditionSchema>;

/** Conditions for a jump, rule or end screen. None means "always". */
const conditions = z
  .array(logicConditionSchema)
  .max(MAX_LOGIC_CONDITIONS, `Use ${MAX_LOGIC_CONDITIONS} conditions or fewer`);

export const jumpTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), pageKey: nodeId }),
  z.object({ kind: z.literal('end'), endScreenId: nodeId }),
]);
export type JumpTarget = z.infer<typeof jumpTargetSchema>;

/** "After this page, if …, go to page X (or end screen Y)". The first that applies wins. */
export const jumpSchema = z.object({
  id: nodeId,
  when: conditions,
  match: conditionMatchSchema,
  to: jumpTargetSchema,
});
export type Jump = z.infer<typeof jumpSchema>;

/** Settings of one page, keyed by `START_PAGE_KEY` or the id of the page break before it. */
export const pageSettingsSchema = z.object({
  /** The first page's title; later pages take theirs from their page break. */
  title: z.string().max(200, 'Use 200 characters or fewer').optional(),
  /** Each respondent sees the page's questions in their own order. */
  shuffleQuestions: z.boolean().optional(),
  jumps: z
    .array(jumpSchema)
    .max(MAX_JUMPS_PER_PAGE, `Use ${MAX_JUMPS_PER_PAGE} jumps or fewer`)
    .optional(),
});
export type PageSettings = z.infer<typeof pageSettingsSchema>;

export const VARIABLE_KINDS = ['number', 'score', 'price'] as const;

/** A value worked out from the answers, such as a score or a price. */
export const variableSchema = z.object({
  id: nodeId,
  /** Shown to the creator, and where the value is piped in. Drafts may leave it empty. */
  name: z.string().max(40, 'Use 40 characters or fewer'),
  kind: z.enum(VARIABLE_KINDS),
  initial: number,
  /** ISO 4217, for prices. */
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code')
    .optional(),
});
export type Variable = z.infer<typeof variableSchema>;

export const RULE_OPERATIONS = ['add', 'subtract', 'multiply', 'set'] as const;

/** "If the answer is X, add 10 to score". Rules run in order. */
export const ruleSchema = z.object({
  id: nodeId,
  when: conditions,
  match: conditionMatchSchema,
  variableId: nodeId,
  operation: z.enum(RULE_OPERATIONS),
  amount: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('number'), value: number }),
    /** A number question's answer, such as a quantity. */
    z.object({ kind: z.literal('answer'), fieldId: nodeId }),
  ]),
});
export type Rule = z.infer<typeof ruleSchema>;

/**
 * The right answer to one quiz question: option ids for choices, accepted texts for short
 * text (case and spacing ignored), numbers written out for number questions.
 */
export const quizAnswerSchema = z.object({
  correct: z.array(z.string().max(500)).max(100),
  points: z.number().int().min(0).max(1000),
});
export type QuizAnswer = z.infer<typeof quizAnswerSchema>;

export const quizSchema = z.object({
  enabled: z.boolean(),
  /** By field id. Never sent to respondents (see `toPublicSchema`). */
  answers: z.record(nodeId, quizAnswerSchema),
  /** The share of the points possible needed to pass, if the quiz can be failed. */
  passPercent: z.number().int().min(0).max(100).optional(),
  /** End screens may show the score; this is the default for new ones. */
  showScore: z.boolean(),
  /** After submitting, respondents see which answers were right. */
  revealAnswers: z.boolean(),
});
export type QuizSettings = z.infer<typeof quizSchema>;

export const redirectParamSchema = z.object({
  /** The query parameter's name. Drafts may leave it empty. */
  name: z.string().max(64),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('answer'), fieldId: nodeId }),
    z.object({ kind: z.literal('variable'), variableId: nodeId }),
  ]),
});
export type RedirectParam = z.infer<typeof redirectParamSchema>;

export const redirectSchema = z.object({
  /** https. Drafts may leave it empty; publishing checks it. */
  url: z.string().max(2048),
  /** Seconds the end screen shows first. */
  delaySeconds: z.number().int().min(0).max(10),
  /** Answers and values added to the URL, each under a name the creator picks. */
  params: z
    .array(redirectParamSchema)
    .max(MAX_REDIRECT_PARAMS, `Use ${MAX_REDIRECT_PARAMS} parameters or fewer`),
});
export type Redirect = z.infer<typeof redirectSchema>;

export const END_SCREEN_ALIGNMENTS = ['center', 'left'] as const;

/**
 * What respondents see after submitting. The first end screen is the default; the others
 * are reached by a jump, or by their own conditions (the first that applies wins).
 */
export const endScreenSchema = z.object({
  id: nodeId,
  /** For the creator, such as "Passed". */
  name: z.string().max(60, 'Use 60 characters or fewer'),
  title: z.string().max(200, 'Use 200 characters or fewer'),
  /** In the rich-text subset, with answers piped in. */
  message: z.string().max(5000, 'Use 5000 characters or fewer'),
  imageUrl: z
    .url({ protocol: /^https$/, error: 'Use an https:// link' })
    .max(2048)
    .optional(),
  button: z
    .object({
      label: z.string().max(40, 'Use 40 characters or fewer'),
      url: z.string().max(2048),
    })
    .optional(),
  align: z.enum(END_SCREEN_ALIGNMENTS),
  /** The quiz score (when there is a quiz). */
  showScore: z.boolean(),
  when: conditions,
  match: conditionMatchSchema,
  redirect: redirectSchema.optional(),
});
export type EndScreen = z.infer<typeof endScreenSchema>;

export const formLogicSchema = z.object({
  pages: z.record(nodeId, pageSettingsSchema),
  variables: z.array(variableSchema).max(MAX_VARIABLES, `Use ${MAX_VARIABLES} variables or fewer`),
  rules: z.array(ruleSchema).max(MAX_RULES, `Use ${MAX_RULES} rules or fewer`),
  quiz: quizSchema.optional(),
  endScreens: z
    .array(endScreenSchema)
    .min(1, 'Keep at least one end screen')
    .max(MAX_END_SCREENS, `Use ${MAX_END_SCREENS} end screens or fewer`),
});
export type FormLogic = z.infer<typeof formLogicSchema>;
