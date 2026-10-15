/*
 * Everything a form says in its own words: buttons, progress, checks on answers, the end
 * screen, saving for later, and the screens around the questions (closed, locked, asking for
 * an email address). One catalog per language; each must say all of it.
 */

export interface FormMessages {
  nav: {
    next: string;
    back: string;
    /** The default text of the button that sends the form. */
    submit: string;
    sending: string;
    pageOf: (page: number, pages: number) => string;
    questionOf: (question: number, questions: number) => string;
    /** For screen readers: how far along, as a percentage already formatted ("25%"). */
    percentComplete: (percent: string) => string;
    progress: string;
    /** "or press Enter": the keyboard shortcut that moves on, by its keys. */
    pressKeys: (keys: string) => string;
    startOver: string;
    welcomeBack: string;
    anotherResponse: string;
    thankYou: string;
    madeWith: string;
    /** Read out after a link that opens in a new tab, such as the badge on an embedded form. */
    opensInNewTab: string;
    /** The link under every public form to report it to Formyx. */
    report: string;
    loading: string;
  };
  marker: {
    /** Read out after a required question's label. */
    required: string;
    /** Shown beside required questions when the form writes the word. */
    requiredWord: string;
    /** Shown beside optional questions when the form marks those instead. */
    optionalWord: string;
  };
  check: {
    required: string;
    enterText: string;
    atMostCharacters: (count: number) => string;
    atLeastCharacters: (count: number) => string;
    enterNumber: string;
    numberAtLeast: (min: string) => string;
    numberAtMost: (max: string) => string;
    valueBetween: (min: string, max: string) => string;
    valueInSteps: (step: string) => string;
    enterAmount: string;
    twoDecimals: string;
    amountAtLeast: (min: string) => string;
    amountAtMost: (max: string) => string;
    orderEverything: string;
    chooseFromColumns: string;
    answerEachRow: string;
    answerRowsShown: string;
    answerEveryRow: string;
    addressFirstLine: string;
    addressCity: string;
    addressState: string;
    pinCode: string;
    enterAddress: string;
    startDate: string;
    endDate: string;
    enterDates: string;
    endAfterStart: string;
    uploadAgain: string;
    email: string;
    phone: string;
    ratingBetween: (max: number) => string;
    date: string;
    chooseOption: string;
    chooseFromOptions: string;
    choosePicture: string;
    chooseFromPictures: string;
    yesOrNo: string;
    scoreBetween: (min: number, max: number) => string;
    time: string;
    website: string;
    colour: string;
    agree: string;
    notValid: string;
    fixAnswers: string;
    waitForUpload: string;
    sendFailed: string;
    /** The spam check (Cloudflare Turnstile) did not pass. */
    captchaFailed: string;
    saveFailed: string;
  };
  answer: {
    yes: string;
    no: string;
    dateRange: (start: string, end: string) => string;
    notAnswered: string;
    none: string;
  };
  end: {
    takingYouOnIn: (seconds: number) => string;
    takingYouOn: string;
    goNow: string;
    score: (score: number, max: number) => string;
    passed: string;
    notPassed: string;
    yourAnswers: string;
    right: string;
    notRight: string;
    yourAnswer: (answer: string) => string;
    rightAnswer: (answer: string) => string;
    editLink: string;
    editLinkHelp: string;
    copyLink: string;
    copied: string;
  };
  save: {
    saveForLater: string;
    emailLabel: string;
    sendLink: string;
    sending: string;
    sent: (email: string) => string;
    privacy: string;
    enterEmail: string;
    failed: string;
    linkExpired: string;
  };
  access: {
    closedTitle: string;
    closedText: string;
    notOpenTitle: string;
    /** Held for review or taken offline by Formyx: said without the form's title. */
    unavailableTitle: string;
    unavailableText: string;
    opensAt: (when: string) => string;
    lockedTitle: string;
    lockedText: string;
    password: string;
    unlock: string;
    unlocking: string;
    wrongPassword: string;
    tooManyTries: string;
    emailTitle: string;
    emailText: string;
    verifyText: string;
    emailLabel: string;
    continue: string;
    codeSent: (email: string) => string;
    codeLabel: string;
    verify: string;
    checking: string;
    sendAgain: string;
    useAnotherEmail: string;
    wrongCode: string;
    alreadyResponded: string;
    alreadyRespondedText: string;
    editingTitle: string;
    editingText: string;
    saveChanges: string;
    editUnavailable: string;
    notFoundTitle: string;
    notFoundText: string;
    loadFailedTitle: string;
    loadFailedText: string;
    tryAgain: string;
  };
  controls: {
    selectOption: string;
    dragToAnswer: string;
    from: string;
    to: string;
    countryCode: string;
    pickColour: string;
    previousRow: string;
    nextRow: string;
    rowOf: (row: number, rows: number) => string;
    rankingHelp: string;
    moveUp: (name: string) => string;
    moveDown: (name: string) => string;
    orderKept: string;
    keepOrder: string;
    faces: [string, string, string, string, string];
    play: string;
    video: string;
  };
  address: {
    line1: string;
    line2: string;
    pin: string;
    city: string;
    state: string;
    lookingUp: string;
    pinNotFound: string;
    typeCityState: string;
  };
  upload: {
    chooseFile: string;
    uploading: (name: string) => string;
    cancel: string;
    tryAgain: string;
    remove: (name: string) => string;
    notHere: string;
    cannotSave: string;
    anyFile: string;
    kinds: {
      images: string;
      documents: string;
      spreadsheets: string;
      presentations: string;
      audio: string;
      video: string;
      archives: string;
    };
  };
  signature: {
    saved: string;
    signAgain: string;
    howToSign: string;
    draw: string;
    type: string;
    typeName: string;
    padLabel: string;
    typedLabel: string;
    signHere: string;
    saving: string;
    clear: string;
  };
  email: {
    /** Why the respondent got the email, under it. */
    why: (formTitle: string) => string;
    /** The code that confirms an email address. */
    codeSubject: (formTitle: string) => string;
    codeText: (formTitle: string) => string;
    codeIgnore: string;
  };
  voice: {
    unsupported: string;
    allowMicrophone: string;
    record: string;
    stop: string;
    recordAgain: string;
    upTo: (duration: string) => string;
    yourNote: string;
    recording: string;
    saving: string;
    saved: string;
  };
}
