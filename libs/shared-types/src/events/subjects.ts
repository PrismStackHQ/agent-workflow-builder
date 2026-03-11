export const SUBJECTS = {
  // Onboarding
  ORG_CREATED: 'onboarding.org.created',
  ORG_UPDATED: 'onboarding.org.updated',

  // Connection
  CONNECTION_ENDPOINT_CONFIGURED: 'connection.endpoint.configured',
  CONNECTION_REF_CREATED: 'connection.ref.created',
  CONNECTION_REF_READY: 'connection.ref.ready',
  CONNECTION_OAUTH_REQUIRED: 'connection.oauth.required',
  CONNECTION_OAUTH_COMPLETED: 'connection.oauth.completed',
  CONNECTION_TOKENS_REQUEST: 'connection.tokens.request',

  // RAG
  RAG_CONFIGURED: 'rag.configured',
  RAG_QUERY_REQUEST: 'rag.query.request',

  // Agent
  AGENT_COMMAND_SUBMITTED: 'agent.command.submitted',
  AGENT_PLAN_PREVIEW: 'agent.plan.preview',
  AGENT_PLAN_CONFIRMED: 'agent.plan.confirmed',
  AGENT_DEFINITION_CREATED: 'agent.definition.created',
  AGENT_DEFINITION_READY: 'agent.definition.ready',

  // Scheduler
  SCHEDULER_AGENT_SCHEDULED: 'scheduler.agent.scheduled',
  SCHEDULER_RUN_TRIGGERED: 'scheduler.run.triggered',

  // Runtime
  RUNTIME_RUN_STARTED: 'runtime.run.started',
  RUNTIME_RUN_STEP_COMPLETED: 'runtime.run.step.completed',
  RUNTIME_RUN_SUCCEEDED: 'runtime.run.succeeded',
  RUNTIME_RUN_FAILED: 'runtime.run.failed',
  RUNTIME_RUN_PAUSED: 'runtime.run.paused',
  RUNTIME_RUN_RESUME_REQUESTED: 'runtime.run.resume.requested',
  RUNTIME_RUN_RESUMED: 'runtime.run.resumed',
  RUNTIME_RUN_SUB_AGENT_STARTED: 'runtime.run.sub_agent.started',
  RUNTIME_RUN_ITERATION_PROGRESS: 'runtime.run.iteration.progress',
  RUNTIME_RUN_THINKING: 'runtime.run.thinking',

  // Tools
  TOOL_REGISTRY_SYNCED: 'tools.registry.synced',

  // Connection completion (end-user OAuth)
  CONNECTION_COMPLETED: 'connection.completed',
} as const;

export const STREAM_NAME = 'AGENT_WORKFLOW';

export const STREAM_SUBJECTS = [
  'onboarding.>',
  'connection.>',
  'rag.>',
  'agent.>',
  'scheduler.>',
  'runtime.>',
  'tools.>',
];
