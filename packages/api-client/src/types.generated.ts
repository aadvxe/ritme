/* AUTO-GENERATED from packages/contracts (Pydantic). Do not edit. Run `pnpm contracts:gen`. */

/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ActionStatus".
 */
export type ActionStatus =
  "pending_approval" | "approved" | "executing" | "succeeded" | "failed" | "rejected" | "cancelled";
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ActionType".
 */
export type ActionType = "create_tasks" | "update_tasks";
export type Createdat = string;
export type Details = {
  [k: string]: unknown | undefined;
} | null;
export type Eventtype = string;
export type Id = string;
export type Summary = string;
export type Workflowid = string | null;
export type Items = ActivityEventOut[];
export type Nextcursor = string | null;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "AgentRunStatus".
 */
export type AgentRunStatus = "running" | "waiting" | "succeeded" | "failed" | "cancelled";
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "AgentRunTrigger".
 */
export type AgentRunTrigger = "capture" | "answer" | "plan" | "replan" | "resume";
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "AnswerDisposition".
 */
export type AnswerDisposition = "answer" | "defer_nonblocking";
export type Answer = string | null;
export type Assumptionlabel = string | null;
export type Confirmeddueat = string | null;
export type AnswerDisposition1 = "answer" | "defer_nonblocking";
export type Dependson = string[];
export type Dueat = string | null;
export type Id1 = string;
export type Status = string;
export type Title = string;
export type Type = "task" | "workflow_deadline";
export type Workflowid1 = string;
export type Workflowtitle = string;
export type Items1 = CalendarItem[];
export type Undated = CalendarItem[];
export type Contenttext = string;
export type Idempotencykey = string;
export type Sourcedomain = string | null;
export type Sourcepagetitle = string | null;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "CaptureSourceType".
 */
export type CaptureSourceType = "browser_selection" | "manual_text" | "upload" | "seed_demo";
export type Sourceurl = string | null;
export type Title1 = string | null;
export type Usernote = string | null;
export type Contenttext1 = string;
export type Createdat1 = string;
export type Id2 = string;
export type Sourcedomain1 = string | null;
export type Sourcepagetitle1 = string | null;
export type Sourceurl1 = string | null;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "CaptureStatus".
 */
export type CaptureStatus = "draft" | "submitted" | "analyzed" | "failed" | "deleted";
export type Title2 = string | null;
export type Updatedat = string;
export type Usernote1 = string | null;
export type Workflowid2 = string | null;
export type Created = boolean;
export type Nexturl = string;
export type Captureid = string | null;
export type Confirmeddueat1 = string | null;
export type Createdat2 = string;
export type Currentplanversion = number | null;
export type Currentstep = string | null;
export type Id3 = string;
export type Isdemo = boolean;
export type Nextaction = string | null;
export type Objective = string | null;
export type Paused = boolean;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "WorkflowStatus".
 */
export type WorkflowStatus =
  | "captured"
  | "analyzing"
  | "needs_input"
  | "planning"
  | "ready_for_approval"
  | "in_progress"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";
export type Title3 = string;
export type Updatedat1 = string;
export type Version = number;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "Certainty".
 */
export type Certainty = "explicit" | "inferred" | "unknown" | "conflicting";
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ChangeType".
 */
export type ChangeType = "create" | "update" | "keep" | "mark_blocked";
export type Chunkid = string | null;
export type Excerpt = string;
export type Location = string | null;
export type Sourcedate = string | null;
export type Sourceid = string;
export type Sourcekind = "capture" | "knowledge";
export type Title4 = string;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ClarificationHelp".
 */
export type ClarificationHelp = "show_questions" | "draft_message" | "independent";
export type Answer1 = string | null;
export type Blocking = boolean;
export type Id4 = string;
export type Question = string;
export type Relatedrequirementids = string[];
export type QuestionStatus = "open" | "answered" | "deferred";
export type Suggestedanswers = string[] | null;
export type Whyitmatters = string;
export type Locale = string;
export type Timezone = string;
export type Today = string;
export type ClarificationHelp1 = "show_questions" | "draft_message" | "independent";
export type CommunicationStyle = "preserve_my_voice" | "make_expectations_explicit" | "offer_tone_options";
export type InformationDensity = "concise" | "balanced" | "detailed";
export type PacingSupport = "off" | "optional_break_cues";
export type PlanLayout = "one_step" | "full_list" | "timeline";
export type TaskGranularity = "small_steps" | "balanced" | "larger_blocks";
export type TimeEstimates = "show" | "hide";
export type Text = string;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "CommunicationStyle".
 */
export type CommunicationStyle1 = "preserve_my_voice" | "make_expectations_explicit" | "offer_tone_options";
export type Createdat3 = string;
export type Id5 = string;
export type Label = string | null;
export type Lastusedat = string | null;
export type Revokedat = string | null;
export type Activeworkflows = WorkflowSummary[];
export type Actionid = string;
export type Summary1 = string;
export type Workflowid3 = string;
export type Workflowtitle1 = string;
export type Needsapproval = NeedsApprovalItem[];
export type Question1 = string;
export type Questionid = string;
export type Workflowid4 = string;
export type Workflowtitle2 = string;
export type Needsinput = NeedsInputItem[];
export type Text1 = string;
export type Workflowid5 = string;
export type Workflowtitle3 = string;
export type Recentactivity = ActivityEventOut[];
export type Recentcaptures = CaptureOut[];
export type Deleted = boolean;
export type Density = string;
export type Reducemotion = string;
export type Textsize = string;
export type Message = string;
export type Notes = string | null;
export type Questionid1 = string;
export type Objective1 = string;
export type Endoffset = number | null;
export type Excerpt1 = string;
export type Sourceid1 = string;
export type Startoffset = number | null;
export type Evidence = EvidenceRef[];
export type Id6 = string;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "Importance".
 */
export type Importance = "blocking" | "useful";
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "RequirementKind".
 */
export type RequirementKind =
  | "objective"
  | "deliverable"
  | "acceptance_criterion"
  | "deadline"
  | "owner"
  | "dependency"
  | "instruction"
  | "fact"
  | "assumption"
  | "unknown"
  | "contradiction";
export type Text2 = string;
export type Userconfirmedat = string | null;
export type Related = RequirementItem[];
export type Sourceexcerpt = string | null;
export type Message1 = string;
export type Notes1 = string | null;
export type Questionid2 = string;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "EngineStep".
 */
export type EngineStep = "extract" | "plan" | "replan" | "draft_clarification" | "collab_guide";
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ErrorCode".
 */
export type ErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_action"
  | "rate_limited"
  | "payload_too_large"
  | "provider_error"
  | "internal";
export type Message2 = string;
export type Requestid = string;
export type Retryable = boolean;
export type Dependson1 = string[];
export type Draftid = string | null;
export type Dueat1 = string | null;
export type Id7 = string;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "TaskStatus".
 */
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "skipped";
export type Title5 = string;
export type Extensionid = string;
export type Label1 = string | null;
export type Refreshtoken = string;
export type Accesstoken = string;
export type Deviceid = string;
export type Expiresat = string;
export type Refreshtoken1 = string;
export type Scopes = "captures:write"[];
export type Captureid1 = string;
export type Contenttext2 = string;
export type Knowledge = Citation[];
export type Confidencenotes = string[];
export type Objective2 = string;
export type Questions = ClarificationQuestion[];
export type Requirements = RequirementItem[];
export type Schemaversion = number;
export type Suggestedtitle = string;
export type Summary2 = string;
export type Sourcedomain2 = string | null;
export type Title6 = string | null;
export type Usernote2 = string | null;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "InformationDensity".
 */
export type InformationDensity1 = "concise" | "balanced" | "detailed";
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "IngestionStatus".
 */
export type IngestionStatus = "pending" | "ready" | "failed";
export type Content = string;
export type Sourcedate1 = string | null;
export type KnowledgeSourceType = "user_text" | "user_markdown" | "seed_demo";
export type Title7 = string;
export type Chunkcount = number;
export type Conflictswith = string[];
export type Contenthash = string;
export type Createdat4 = string;
export type Id8 = string;
export type Isseed = boolean;
export type Sourcedate2 = string | null;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "KnowledgeSourceType".
 */
export type KnowledgeSourceType1 = "user_text" | "user_markdown" | "seed_demo";
export type Title8 = string;
export type Documentids = string[] | null;
export type Query = string;
export type Results = Citation[];
export type Displayname = string | null;
export type Email = string | null;
export type Id9 = string;
export type Onboardingcompleted = boolean;
export type Photourl = string | null;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PacingSupport".
 */
export type PacingSupport1 = "off" | "optional_break_cues";
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PlanAuthor".
 */
export type PlanAuthor = "agent" | "user";
export type Existingtasks = ExistingTask[];
export type Knowledge1 = Citation[];
export type Nextversion = number;
export type Objective3 = string;
export type Questions1 = ClarificationQuestion[];
export type Requirements1 = RequirementItem[];
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PlanLayout".
 */
export type PlanLayout1 = "one_step" | "full_list" | "timeline";
export type Goal = string | null;
export type Rowversion = number;
export type Tasks = PlanTaskDraft[] | null;
export type Definitionofdone = string;
export type Dependsondraftids = string[];
export type Description = string;
export type Draftid1 = string;
export type Dueat2 = string | null;
export type Estimatedminutes = number | null;
export type Rationale = string | null;
export type Requirementids = string[];
export type Title9 = string;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PlanStatus".
 */
export type PlanStatus = "draft" | "approved" | "superseded";
export type Definitionofdone1 = string;
export type Dependsondraftids1 = string[];
export type Description1 = string;
export type Draftid2 = string;
export type Dueat3 = string | null;
export type Estimatedminutes1 = number | null;
export type Rationale1 = string | null;
export type Requirementids1 = string[];
export type Title10 = string;
export type Createdat5 = string;
export type Goal1 = string;
export type Id10 = string;
export type Goal2 = string;
export type Proposedchanges = ProposedChange[] | null;
export type After = {
  [k: string]: unknown | undefined;
} | null;
export type Before = {
  [k: string]: unknown | undefined;
} | null;
export type Existingtaskid = string | null;
export type Reason = string;
export type Tasks1 = PlanTaskDraft1[];
export type Unresolveditems = string[];
export type Version1 = number;
export type Rowversion1 = number;
export type Updatedat2 = string;
export type Version2 = number;
export type Workflowid6 = string;
export type ClarificationHelp2 = "show_questions" | "draft_message" | "independent";
export type CommunicationStyle2 = "preserve_my_voice" | "make_expectations_explicit" | "offer_tone_options";
export type Consentrecordedat = string | null;
export type Consentversion = string | null;
export type InformationDensity2 = "concise" | "balanced" | "detailed";
export type Isset = boolean;
export type PacingSupport2 = "off" | "optional_break_cues";
export type PlanLayout2 = "one_step" | "full_list" | "timeline";
export type TaskGranularity1 = "small_steps" | "balanced" | "larger_blocks";
export type TimeEstimates1 = "show" | "hide";
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "TaskGranularity".
 */
export type TaskGranularity2 = "small_steps" | "balanced" | "larger_blocks";
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "TimeEstimates".
 */
export type TimeEstimates2 = "show" | "hide";
export type Capturescount = number;
export type Employeraccess = "none";
export type Knowledgedocumentscount = number;
export type Logretentionnote = string;
export type Modelprocessingnote = string;
export type Modelprovider = string;
export type Taskscount = number;
export type Workflowscount = number;
export type Planversionid = string;
export type Approvedat = string | null;
export type Createdat6 = string;
export type Errorcode = string | null;
export type Executedat = string | null;
export type Id11 = string;
export type Planversionid1 = string | null;
export type Provider = string;
export type Reasonsummary = string;
export type Resultids = string[];
export type Resultsummary = string | null;
export type VerificationState = "verified" | "unverified" | "not_run";
export type Workflowid7 = string;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "QuestionStatus".
 */
export type QuestionStatus1 = "open" | "answered" | "deferred";
export type Blastradiustaskids = string[];
export type Changedrequirementid = string | null;
export type Existingtasks1 = ExistingTask[];
export type Knowledge2 = Citation[];
export type Newdueat = string | null;
export type Newtext = string | null;
export type Nextversion1 = number;
export type Objective4 = string;
export type Questions2 = ClarificationQuestion[];
export type Requirements2 = RequirementItem[];
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ReplanTrigger".
 */
export type ReplanTrigger = "request_changed" | "could_not_work";
export type Newdueat1 = string | null;
export type Newtext1 = string | null;
export type Requirementid = string | null;
export type Blastradiustaskids1 = string[];
export type Diff = ProposedChange[];
export type Confirm = boolean | null;
export type Reject = boolean | null;
export type Text3 = string | null;
export type Lastcompletedstep = string | null;
export type Nextaction1 = string | null;
export type Openquestioncount = number;
export type Sourcetitle = string | null;
export type Sourceurl2 = string | null;
export type Usernote3 = string | null;
export type Attempts = number;
export type Model = string;
export type Promptversion = string;
export type Repaired = boolean;
export type Createdat7 = string;
export type Createdbyactionid = string | null;
export type Definitionofdone2 = string;
export type Dependson2 = string[];
export type Description2 = string;
export type Dueat4 = string | null;
export type Estimatedminutes2 = number | null;
export type Id12 = string;
export type Planversionid2 = string | null;
export type Requirementids2 = string[];
export type Title11 = string;
export type Updatedat3 = string;
export type Workflowid8 = string;
export type Definitionofdone3 = string | null;
export type Description3 = string | null;
export type Title12 = string | null;
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "VerificationState".
 */
export type VerificationState1 = "verified" | "unverified" | "not_run";
export type Actions = ProposedActionOut[];
export type Questions3 = ClarificationQuestion[];
export type Requirements3 = RequirementItem[];
export type Sources = Citation[];
export type Tasks2 = TaskOut[];
export type Confirmeddueat2 = string | null;
export type Nextaction2 = string | null;
export type Objective5 = string | null;
export type Title13 = string | null;
export type Version3 = number;

export interface RitmeContracts {
  ActionStatus?: ActionStatus;
  ActionType?: ActionType;
  ActivityEventOut?: ActivityEventOut;
  ActivityPage?: ActivityPage;
  AgentRunStatus?: AgentRunStatus;
  AgentRunTrigger?: AgentRunTrigger;
  AnswerDisposition?: AnswerDisposition;
  AnswerRequest?: AnswerRequest;
  CalendarItem?: CalendarItem;
  CalendarOverview?: CalendarOverview;
  CaptureCreate?: CaptureCreate;
  CaptureCreateResponse?: CaptureCreateResponse;
  CaptureOut?: CaptureOut;
  CaptureSourceType?: CaptureSourceType;
  CaptureStatus?: CaptureStatus;
  Certainty?: Certainty;
  ChangeType?: ChangeType;
  Citation?: Citation;
  ClarificationHelp?: ClarificationHelp;
  ClarificationQuestion?: ClarificationQuestion;
  CollabGuideInput?: CollabGuideInput;
  CollabGuideOutput?: CollabGuideOutput;
  CommunicationStyle?: CommunicationStyle1;
  ConnectedDevice?: ConnectedDevice;
  DashboardOut?: DashboardOut;
  DeletionResult?: DeletionResult;
  DisplaySettings?: DisplaySettings;
  DraftClarification?: DraftClarification;
  DraftClarificationInput?: DraftClarificationInput;
  DraftClarificationResponse?: DraftClarificationResponse;
  EngineStep?: EngineStep;
  ErrorBody?: ErrorBody;
  ErrorCode?: ErrorCode;
  ErrorResponse?: ErrorResponse;
  EvidenceRef?: EvidenceRef;
  ExistingTask?: ExistingTask;
  ExtensionConnectRequest?: ExtensionConnectRequest;
  ExtensionRefreshRequest?: ExtensionRefreshRequest;
  ExtensionTokenResponse?: ExtensionTokenResponse;
  ExtractInput?: ExtractInput;
  Importance?: Importance;
  InformationDensity?: InformationDensity1;
  IngestionStatus?: IngestionStatus;
  KnowledgeDocCreate?: KnowledgeDocCreate;
  KnowledgeDocOut?: KnowledgeDocOut;
  KnowledgeSearchRequest?: KnowledgeSearchRequest;
  KnowledgeSearchResponse?: KnowledgeSearchResponse;
  KnowledgeSourceType?: KnowledgeSourceType1;
  MeOut?: MeOut;
  NeedsApprovalItem?: NeedsApprovalItem;
  NeedsInputItem?: NeedsInputItem;
  NextBestStep?: NextBestStep;
  PacingSupport?: PacingSupport1;
  PlanAuthor?: PlanAuthor;
  PlanInput?: PlanInput;
  PlanLayout?: PlanLayout1;
  PlanPatch?: PlanPatch;
  PlanStatus?: PlanStatus;
  "PlanTaskDraft-Input"?: PlanTaskDraft;
  "PlanTaskDraft-Output"?: PlanTaskDraft1;
  PlanVersionOut?: PlanVersionOut;
  Preferences?: Preferences;
  PreferencesOut?: PreferencesOut;
  PreferencesPatch?: PreferencesPatch;
  PrivacyOverview?: PrivacyOverview;
  ProposeActionRequest?: ProposeActionRequest;
  ProposedActionOut?: ProposedActionOut;
  ProposedChange?: ProposedChange;
  QuestionStatus?: QuestionStatus1;
  ReplanInput?: ReplanInput;
  ReplanRequest?: ReplanRequest;
  ReplanResponse?: ReplanResponse;
  ReplanTrigger?: ReplanTrigger;
  RequirementItem?: RequirementItem;
  RequirementKind?: RequirementKind;
  RequirementPatch?: RequirementPatch;
  ResumeCard?: ResumeCard;
  StepContext?: StepContext;
  StepMeta?: StepMeta;
  TaskGranularity?: TaskGranularity2;
  TaskOut?: TaskOut;
  TaskPatch?: TaskPatch;
  TaskStatus?: TaskStatus;
  TimeEstimates?: TimeEstimates2;
  VerificationState?: VerificationState1;
  WorkflowDetail?: WorkflowDetail;
  WorkflowExtraction?: WorkflowExtraction;
  WorkflowPatch?: WorkflowPatch;
  WorkflowPlanDraft?: WorkflowPlanDraft;
  WorkflowStatus?: WorkflowStatus;
  WorkflowSummary?: WorkflowSummary;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ActivityEventOut".
 */
export interface ActivityEventOut {
  createdAt: Createdat;
  details: Details;
  eventType: Eventtype;
  id: Id;
  summary: Summary;
  workflowId: Workflowid;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ActivityPage".
 */
export interface ActivityPage {
  items: Items;
  nextCursor: Nextcursor;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "AnswerRequest".
 */
export interface AnswerRequest {
  answer?: Answer;
  assumptionLabel?: Assumptionlabel;
  confirmedDueAt?: Confirmeddueat;
  disposition?: AnswerDisposition1;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "CalendarItem".
 */
export interface CalendarItem {
  dependsOn: Dependson;
  dueAt: Dueat;
  id: Id1;
  status: Status;
  title: Title;
  type: Type;
  workflowId: Workflowid1;
  workflowTitle: Workflowtitle;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "CalendarOverview".
 */
export interface CalendarOverview {
  items: Items1;
  undated: Undated;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "CaptureCreate".
 */
export interface CaptureCreate {
  contentText: Contenttext;
  idempotencyKey: Idempotencykey;
  sourceDomain?: Sourcedomain;
  sourcePageTitle?: Sourcepagetitle;
  sourceType: CaptureSourceType;
  sourceUrl?: Sourceurl;
  title?: Title1;
  userNote?: Usernote;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "CaptureCreateResponse".
 */
export interface CaptureCreateResponse {
  capture: CaptureOut;
  created: Created;
  nextUrl: Nexturl;
  workflow: WorkflowSummary;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "CaptureOut".
 */
export interface CaptureOut {
  contentText: Contenttext1;
  createdAt: Createdat1;
  id: Id2;
  sourceDomain: Sourcedomain1;
  sourcePageTitle: Sourcepagetitle1;
  sourceType: CaptureSourceType;
  sourceUrl: Sourceurl1;
  status: CaptureStatus;
  title: Title2;
  updatedAt: Updatedat;
  userNote: Usernote1;
  workflowId: Workflowid2;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "WorkflowSummary".
 */
export interface WorkflowSummary {
  captureId: Captureid;
  confirmedDueAt: Confirmeddueat1;
  createdAt: Createdat2;
  currentPlanVersion: Currentplanversion;
  currentStep: Currentstep;
  id: Id3;
  isDemo: Isdemo;
  nextAction: Nextaction;
  objective: Objective;
  paused: Paused;
  status: WorkflowStatus;
  title: Title3;
  updatedAt: Updatedat1;
  version: Version;
}
/**
 * A source excerpt that resolves to a stored chunk (or to the capture itself).
 *
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "Citation".
 */
export interface Citation {
  chunkId: Chunkid;
  excerpt: Excerpt;
  location: Location;
  sourceDate: Sourcedate;
  sourceId: Sourceid;
  sourceKind: Sourcekind;
  title: Title4;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ClarificationQuestion".
 */
export interface ClarificationQuestion {
  answer: Answer1;
  blocking: Blocking;
  id: Id4;
  question: Question;
  relatedRequirementIds: Relatedrequirementids;
  status: QuestionStatus;
  suggestedAnswers: Suggestedanswers;
  whyItMatters: Whyitmatters;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "CollabGuideInput".
 */
export interface CollabGuideInput {
  context: StepContext;
  preferences: Preferences;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "StepContext".
 */
export interface StepContext {
  locale: Locale;
  timezone: Timezone;
  today: Today;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "Preferences".
 */
export interface Preferences {
  clarificationHelp: ClarificationHelp1;
  communicationStyle: CommunicationStyle;
  informationDensity: InformationDensity;
  pacingSupport: PacingSupport;
  planLayout: PlanLayout;
  taskGranularity: TaskGranularity;
  timeEstimates: TimeEstimates;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "CollabGuideOutput".
 */
export interface CollabGuideOutput {
  text: Text;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ConnectedDevice".
 */
export interface ConnectedDevice {
  createdAt: Createdat3;
  id: Id5;
  label: Label;
  lastUsedAt: Lastusedat;
  revokedAt: Revokedat;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "DashboardOut".
 */
export interface DashboardOut {
  activeWorkflows: Activeworkflows;
  needsApproval: Needsapproval;
  needsInput: Needsinput;
  nextBestStep: NextBestStep | null;
  recentActivity: Recentactivity;
  recentCaptures: Recentcaptures;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "NeedsApprovalItem".
 */
export interface NeedsApprovalItem {
  actionId: Actionid;
  summary: Summary1;
  workflowId: Workflowid3;
  workflowTitle: Workflowtitle1;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "NeedsInputItem".
 */
export interface NeedsInputItem {
  question: Question1;
  questionId: Questionid;
  workflowId: Workflowid4;
  workflowTitle: Workflowtitle2;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "NextBestStep".
 */
export interface NextBestStep {
  text: Text1;
  workflowId: Workflowid5;
  workflowTitle: Workflowtitle3;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "DeletionResult".
 */
export interface DeletionResult {
  deleted: Deleted;
  removed: Removed;
}
export interface Removed {
  [k: string]: number | undefined;
}
/**
 * Local presentation settings; not behavioural preferences.
 *
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "DisplaySettings".
 */
export interface DisplaySettings {
  density: Density;
  reduceMotion: Reducemotion;
  textSize: Textsize;
}
/**
 * A polite, editable message the user may send themselves. Never auto-sent.
 *
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "DraftClarification".
 */
export interface DraftClarification {
  message: Message;
  notes: Notes;
  questionId: Questionid1;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "DraftClarificationInput".
 */
export interface DraftClarificationInput {
  context: StepContext;
  objective: Objective1;
  preferences: Preferences;
  question: ClarificationQuestion;
  related: Related;
  sourceExcerpt: Sourceexcerpt;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "RequirementItem".
 */
export interface RequirementItem {
  certainty: Certainty;
  evidence: Evidence;
  id: Id6;
  importance: Importance;
  kind: RequirementKind;
  text: Text2;
  userConfirmedAt: Userconfirmedat;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "EvidenceRef".
 */
export interface EvidenceRef {
  endOffset: Endoffset;
  excerpt: Excerpt1;
  sourceId: Sourceid1;
  startOffset: Startoffset;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "DraftClarificationResponse".
 */
export interface DraftClarificationResponse {
  message: Message1;
  notes: Notes1;
  questionId: Questionid2;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ErrorBody".
 */
export interface ErrorBody {
  code: ErrorCode;
  message: Message2;
  requestId: Requestid;
  retryable: Retryable;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ErrorResponse".
 */
export interface ErrorResponse {
  error: ErrorBody;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ExistingTask".
 */
export interface ExistingTask {
  dependsOn: Dependson1;
  draftId: Draftid;
  dueAt: Dueat1;
  id: Id7;
  status: TaskStatus;
  title: Title5;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ExtensionConnectRequest".
 */
export interface ExtensionConnectRequest {
  extensionId: Extensionid;
  label?: Label1;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ExtensionRefreshRequest".
 */
export interface ExtensionRefreshRequest {
  refreshToken: Refreshtoken;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ExtensionTokenResponse".
 */
export interface ExtensionTokenResponse {
  accessToken: Accesstoken;
  deviceId: Deviceid;
  expiresAt: Expiresat;
  refreshToken: Refreshtoken1;
  scopes: Scopes;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ExtractInput".
 */
export interface ExtractInput {
  captureId: Captureid1;
  contentText: Contenttext2;
  context: StepContext;
  knowledge: Knowledge;
  preferences: Preferences;
  prior: WorkflowExtraction | null;
  sourceDomain: Sourcedomain2;
  title: Title6;
  userNote: Usernote2;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "WorkflowExtraction".
 */
export interface WorkflowExtraction {
  confidenceNotes: Confidencenotes;
  objective: Objective2;
  questions: Questions;
  requirements: Requirements;
  schemaVersion: Schemaversion;
  suggestedTitle: Suggestedtitle;
  summary: Summary2;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "KnowledgeDocCreate".
 */
export interface KnowledgeDocCreate {
  content: Content;
  sourceDate?: Sourcedate1;
  sourceType?: KnowledgeSourceType;
  title: Title7;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "KnowledgeDocOut".
 */
export interface KnowledgeDocOut {
  chunkCount: Chunkcount;
  conflictsWith: Conflictswith;
  contentHash: Contenthash;
  createdAt: Createdat4;
  id: Id8;
  ingestionStatus: IngestionStatus;
  isSeed: Isseed;
  sourceDate: Sourcedate2;
  sourceType: KnowledgeSourceType1;
  title: Title8;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "KnowledgeSearchRequest".
 */
export interface KnowledgeSearchRequest {
  documentIds?: Documentids;
  query: Query;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "KnowledgeSearchResponse".
 */
export interface KnowledgeSearchResponse {
  results: Results;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "MeOut".
 */
export interface MeOut {
  displayName: Displayname;
  email: Email;
  id: Id9;
  onboardingCompleted: Onboardingcompleted;
  photoUrl: Photourl;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PlanInput".
 */
export interface PlanInput {
  context: StepContext;
  existingTasks: Existingtasks;
  knowledge: Knowledge1;
  nextVersion: Nextversion;
  objective: Objective3;
  preferences: Preferences;
  questions: Questions1;
  requirements: Requirements1;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PlanPatch".
 */
export interface PlanPatch {
  goal?: Goal;
  rowVersion: Rowversion;
  tasks?: Tasks;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PlanTaskDraft-Input".
 */
export interface PlanTaskDraft {
  definitionOfDone: Definitionofdone;
  dependsOnDraftIds?: Dependsondraftids;
  description?: Description;
  draftId: Draftid1;
  dueAt?: Dueat2;
  estimatedMinutes?: Estimatedminutes;
  rationale?: Rationale;
  requirementIds?: Requirementids;
  title: Title9;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PlanTaskDraft-Output".
 */
export interface PlanTaskDraft1 {
  definitionOfDone: Definitionofdone1;
  dependsOnDraftIds: Dependsondraftids1;
  description: Description1;
  draftId: Draftid2;
  dueAt: Dueat3;
  estimatedMinutes: Estimatedminutes1;
  rationale: Rationale1;
  requirementIds: Requirementids1;
  title: Title10;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PlanVersionOut".
 */
export interface PlanVersionOut {
  createdAt: Createdat5;
  createdBy: PlanAuthor;
  goal: Goal1;
  id: Id10;
  plan: WorkflowPlanDraft;
  rowVersion: Rowversion1;
  status: PlanStatus;
  updatedAt: Updatedat2;
  version: Version2;
  workflowId: Workflowid6;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "WorkflowPlanDraft".
 */
export interface WorkflowPlanDraft {
  goal: Goal2;
  proposedChanges: Proposedchanges;
  tasks: Tasks1;
  unresolvedItems: Unresolveditems;
  version: Version1;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ProposedChange".
 */
export interface ProposedChange {
  after: After;
  before: Before;
  changeType: ChangeType;
  existingTaskId: Existingtaskid;
  reason: Reason;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PreferencesOut".
 */
export interface PreferencesOut {
  clarificationHelp: ClarificationHelp2;
  communicationStyle: CommunicationStyle2;
  consentRecordedAt: Consentrecordedat;
  consentVersion: Consentversion;
  informationDensity: InformationDensity2;
  isSet: Isset;
  pacingSupport: PacingSupport2;
  planLayout: PlanLayout2;
  taskGranularity: TaskGranularity1;
  timeEstimates: TimeEstimates1;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PreferencesPatch".
 */
export interface PreferencesPatch {
  clarificationHelp?: ClarificationHelp | null;
  communicationStyle?: CommunicationStyle1 | null;
  informationDensity?: InformationDensity1 | null;
  pacingSupport?: PacingSupport1 | null;
  planLayout?: PlanLayout1 | null;
  taskGranularity?: TaskGranularity2 | null;
  timeEstimates?: TimeEstimates2 | null;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "PrivacyOverview".
 */
export interface PrivacyOverview {
  capturesCount: Capturescount;
  employerAccess: Employeraccess;
  knowledgeDocumentsCount: Knowledgedocumentscount;
  logRetentionNote: Logretentionnote;
  modelProcessingNote: Modelprocessingnote;
  modelProvider: Modelprovider;
  tasksCount: Taskscount;
  workflowsCount: Workflowscount;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ProposeActionRequest".
 */
export interface ProposeActionRequest {
  planVersionId: Planversionid;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ProposedActionOut".
 */
export interface ProposedActionOut {
  actionType: ActionType;
  approvedAt: Approvedat;
  createdAt: Createdat6;
  errorCode: Errorcode;
  executedAt: Executedat;
  id: Id11;
  payload: Payload;
  planVersionId: Planversionid1;
  provider: Provider;
  reasonSummary: Reasonsummary;
  resultIds: Resultids;
  resultSummary: Resultsummary;
  status: ActionStatus;
  verification: VerificationState;
  workflowId: Workflowid7;
}
export interface Payload {
  [k: string]: unknown | undefined;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ReplanInput".
 */
export interface ReplanInput {
  blastRadiusTaskIds: Blastradiustaskids;
  changedRequirementId: Changedrequirementid;
  context: StepContext;
  currentPlan: WorkflowPlanDraft;
  existingTasks: Existingtasks1;
  knowledge: Knowledge2;
  newDueAt: Newdueat;
  newText: Newtext;
  nextVersion: Nextversion1;
  objective: Objective4;
  preferences: Preferences;
  questions: Questions2;
  requirements: Requirements2;
  trigger: ReplanTrigger;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ReplanRequest".
 */
export interface ReplanRequest {
  newDueAt?: Newdueat1;
  newText?: Newtext1;
  requirementId?: Requirementid;
  trigger: ReplanTrigger;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ReplanResponse".
 */
export interface ReplanResponse {
  action: ProposedActionOut;
  blastRadiusTaskIds: Blastradiustaskids1;
  diff: Diff;
  plan: PlanVersionOut;
}
/**
 * Truth Board edits: confirm / edit / reject an item. Confirmed items become the latest truth.
 *
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "RequirementPatch".
 */
export interface RequirementPatch {
  confirm?: Confirm;
  reject?: Reject;
  text?: Text3;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "ResumeCard".
 */
export interface ResumeCard {
  lastCompletedStep: Lastcompletedstep;
  nextAction: Nextaction1;
  openQuestionCount: Openquestioncount;
  sourceTitle: Sourcetitle;
  sourceUrl: Sourceurl2;
  status: WorkflowStatus;
  userNote: Usernote3;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "StepMeta".
 */
export interface StepMeta {
  attempts: Attempts;
  model: Model;
  promptVersion: Promptversion;
  repaired: Repaired;
  step: EngineStep;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "TaskOut".
 */
export interface TaskOut {
  createdAt: Createdat7;
  createdByActionId: Createdbyactionid;
  definitionOfDone: Definitionofdone2;
  dependsOn: Dependson2;
  description: Description2;
  dueAt: Dueat4;
  estimatedMinutes: Estimatedminutes2;
  id: Id12;
  planVersionId: Planversionid2;
  requirementIds: Requirementids2;
  status: TaskStatus;
  title: Title11;
  updatedAt: Updatedat3;
  workflowId: Workflowid8;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "TaskPatch".
 */
export interface TaskPatch {
  definitionOfDone?: Definitionofdone3;
  description?: Description3;
  status?: TaskStatus | null;
  title?: Title12;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "WorkflowDetail".
 */
export interface WorkflowDetail {
  actions: Actions;
  capture: CaptureOut | null;
  latestPlan: PlanVersionOut | null;
  questions: Questions3;
  requirements: Requirements3;
  resume: ResumeCard;
  sources: Sources;
  tasks: Tasks2;
  workflow: WorkflowSummary;
}
/**
 * This interface was referenced by `RitmeContracts`'s JSON-Schema
 * via the `definition` "WorkflowPatch".
 */
export interface WorkflowPatch {
  confirmedDueAt?: Confirmeddueat2;
  nextAction?: Nextaction2;
  objective?: Objective5;
  title?: Title13;
  version: Version3;
}
