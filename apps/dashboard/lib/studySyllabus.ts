export type StudySubchapter = {
  id: string;
  title: string;
  concepts: string[];
};

export type StudyChapter = {
  id: string;
  title: string;
  priority: number;
  subchapters: StudySubchapter[];
};

export const STUDY_CHAPTERS: StudyChapter[] = [
  {
    id: 'core-cs-fundamentals',
    title: 'Core CS Fundamentals',
    priority: 1,
    subchapters: [
      {
        id: 'memory-model',
        title: 'Memory Model',
        concepts: ['Stack vs Heap', 'Call Stack', 'Memory Allocation', 'Garbage Collection', 'Memory Leaks'],
      },
      {
        id: 'processes-threads',
        title: 'Processes & Threads',
        concepts: [
          'Process vs Thread',
          'Context Switch',
          'Race Conditions',
          'Synchronization Basics',
          'Mutex',
          'Semaphore',
          'Deadlock (concept)',
          'Linux Processes (ps / top / kill / signals)',
        ],
      },
      {
        id: 'concurrency-node',
        title: 'Concurrency in Node.js',
        concepts: [
          'Event Loop',
          'Async vs Blocking',
          'Promises / async-await',
          'Promise.all vs Sequential execution',
          'Microtask vs Macrotask',
          'Worker Threads',
          'libuv Thread Pool (concept)',
        ],
      },
    ],
  },
  {
    id: 'oop',
    title: 'Object-Oriented Programming (OOP)',
    priority: 2,
    subchapters: [
      {
        id: 'oop-core',
        title: 'Core OOP Principles',
        concepts: ['Encapsulation', 'Abstraction', 'Inheritance', 'Polymorphism'],
      },
      {
        id: 'oop-design',
        title: 'Design Decisions',
        concepts: ['Composition vs Inheritance', 'Interface vs Abstract Class', 'Immutability', 'Separation of Concerns'],
      },
      {
        id: 'solid',
        title: 'SOLID Principles',
        concepts: [
          'SRP - Single Responsibility Principle',
          'OCP - Open/Closed Principle',
          'LSP - Liskov Substitution Principle',
          'ISP - Interface Segregation Principle',
          'DIP - Dependency Inversion Principle',
        ],
      },
      {
        id: 'backend-patterns',
        title: 'Common Backend Design Patterns',
        concepts: ['Repository Pattern', 'Service Layer Pattern', 'Factory Pattern', 'Dependency Injection', 'Registry Pattern'],
      },
    ],
  },
  {
    id: 'dsa',
    title: 'Data Structures & Algorithmic Complexity',
    priority: 3,
    subchapters: [
      {
        id: 'complexity',
        title: 'Complexity Analysis',
        concepts: [
          'Big-O Notation',
          'Time Complexity',
          'Space Complexity',
          'Time vs Space Tradeoffs',
          'Edge Cases / Boundary Conditions',
          'Off-by-one',
          'Empty inputs',
          'n = 1',
        ],
      },
      {
        id: 'data-structures',
        title: 'Core Data Structures',
        concepts: ['Array / Vector', 'Linked List', 'HashMap / Dictionary', 'Hash collisions (concept)', 'Stack', 'Queue'],
      },
      {
        id: 'graphs',
        title: 'Graph Concepts',
        concepts: ['Adjacency List', 'Adjacency Matrix', 'BFS', 'DFS'],
      },
    ],
  },
  {
    id: 'database-fundamentals',
    title: 'Database Fundamentals',
    priority: 4,
    subchapters: [
      {
        id: 'query-performance',
        title: 'Query Performance',
        concepts: ['Index vs Full Table Scan', 'What is an Index', 'Query complexity with / without index'],
      },
      {
        id: 'acid',
        title: 'Database Guarantees',
        concepts: ['Atomicity', 'Consistency', 'Isolation', 'Durability'],
      },
      {
        id: 'isolation-levels',
        title: 'Isolation Levels',
        concepts: ['Read Committed', 'Repeatable Read', 'Serializable'],
      },
      {
        id: 'locking',
        title: 'Locking',
        concepts: ['Optimistic locking', 'Pessimistic locking'],
      },
      {
        id: 'query-problems',
        title: 'Query Problems',
        concepts: ['N+1 Query Problem'],
      },
      {
        id: 'pagination',
        title: 'Pagination',
        concepts: ['Offset pagination', 'Cursor pagination'],
      },
    ],
  },
  {
    id: 'backend-system-basics',
    title: 'Backend / System Fundamentals',
    priority: 5,
    subchapters: [
      {
        id: 'rest',
        title: 'REST APIs',
        concepts: ['REST principles', 'Statelessness', 'Resource-based APIs', 'Idempotency'],
      },
      {
        id: 'http-protocol',
        title: 'HTTP Protocol',
        concepts: [
          'HTTP Methods (GET/POST/PUT/PATCH/DELETE)',
          'HTTP Status Codes (2xx/4xx/5xx)',
          'Important: 200/201/204/400/401/403/404/409/429/500/503',
        ],
      },
      {
        id: 'serialization',
        title: 'Data Serialization',
        concepts: ['JSON serialization', 'Payload compatibility', 'Versioning'],
      },
      {
        id: 'caching',
        title: 'Caching',
        concepts: ['Why caching exists', 'Cache-aside pattern', 'TTL', 'Cache invalidation problem', 'Redis (conceptual)'],
      },
      {
        id: 'rate-limiting',
        title: 'Rate Limiting',
        concepts: ['Per user', 'Per IP', 'Per API key', 'Token bucket', 'Leaky bucket'],
      },
      {
        id: 'retry-backoff',
        title: 'Retry & Backoff',
        concepts: ['Retry conditions', 'Exponential backoff', 'Jitter', 'Idempotency requirement'],
      },
      {
        id: 'observability',
        title: 'Observability',
        concepts: [
          'Structured logging',
          'Log levels',
          'Metrics: latency/error rate/throughput',
          'Tracing (concept)',
          'Correlation ID & request ID propagation',
        ],
      },
    ],
  },
  {
    id: 'networking-fundamentals',
    title: 'Networking Fundamentals',
    priority: 6,
    subchapters: [
      {
        id: 'transport-layer',
        title: 'Transport Layer',
        concepts: ['TCP vs UDP', 'TCP 3-Way Handshake', 'Connection lifecycle'],
      },
      {
        id: 'http-lifecycle',
        title: 'HTTP Lifecycle',
        concepts: ['DNS lookup', 'TCP connection', 'TLS handshake', 'HTTP request/response flow'],
      },
      {
        id: 'http-performance',
        title: 'HTTP Performance Concepts',
        concepts: ['Keep-alive', 'Connection pooling', 'Load Balancers (L4/L7)'],
      },
    ],
  },
  {
    id: 'distributed-systems',
    title: 'Distributed Systems Fundamentals',
    priority: 7,
    subchapters: [
      {
        id: 'consistency-models',
        title: 'Consistency Models',
        concepts: ['Strong Consistency', 'Eventual Consistency'],
      },
      {
        id: 'delivery-guarantees',
        title: 'Message Delivery Guarantees',
        concepts: ['At-least-once', 'At-most-once', 'Exactly-once (why hard)'],
      },
      {
        id: 'failure-handling',
        title: 'Failure Handling Patterns',
        concepts: ['Circuit Breaker', 'Backpressure'],
      },
      {
        id: 'idempotency-distributed',
        title: 'Idempotency in Distributed Systems',
        concepts: ['Idempotency keys', 'Deduplication', 'Unique constraints'],
      },
    ],
  },
  {
    id: 'containers-deployment',
    title: 'Containers & Deployment',
    priority: 8,
    subchapters: [
      {
        id: 'docker',
        title: 'Docker',
        concepts: ['Image vs Container', 'Layers', 'Environment Variables', 'Ports', 'Volumes'],
      },
      {
        id: 'kubernetes',
        title: 'Kubernetes',
        concepts: ['Pod', 'Deployment', 'Service', 'Replica Scaling', 'HPA (concept)'],
      },
      {
        id: 'cicd',
        title: 'CI/CD',
        concepts: ['Build', 'Test', 'Artifact', 'Deploy', 'Rollback', 'Feature flags'],
      },
    ],
  },
  {
    id: 'security-fundamentals',
    title: 'Security Fundamentals',
    priority: 9,
    subchapters: [
      {
        id: 'auth',
        title: 'Authentication vs Authorization',
        concepts: ['AuthN', 'AuthZ'],
      },
      {
        id: 'jwt',
        title: 'JWT',
        concepts: ['Claims', 'Signature', 'Expiration'],
      },
      {
        id: 'web-security',
        title: 'Web Security Basics',
        concepts: ['CORS', 'CSRF'],
      },
      {
        id: 'input-validation',
        title: 'Input Validation',
        concepts: ['Schema validation', 'Request validation', 'Preventing injection'],
      },
    ],
  },
  {
    id: 'ai-llm-optional',
    title: 'AI / LLM (optional)',
    priority: 10,
    subchapters: [
      {
        id: 'tokens',
        title: 'Tokens',
        concepts: ['Context window', 'Cost implications'],
      },
      {
        id: 'tool-calling',
        title: 'Tool Calling',
        concepts: ['JSON tool schema', 'Execution loop'],
      },
      {
        id: 'structured-output',
        title: 'Structured Output',
        concepts: ['JSON schema', 'Validation'],
      },
      {
        id: 'rag',
        title: 'RAG',
        concepts: ['Embeddings', 'Vector DB', 'Similarity search'],
      },
      {
        id: 'mcp',
        title: 'MCP',
        concepts: ['Model Context Protocol', 'Standard tool/data integration'],
      },
    ],
  },
];

export type FlatConcept = {
  conceptId: string;
  conceptLabel: string;
  chapterId: string;
  chapterTitle: string;
  chapterPriority: number;
  subchapterId: string;
  subchapterTitle: string;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getPrioritizedChapters() {
  return [...STUDY_CHAPTERS].sort((a, b) => a.priority - b.priority);
}

export function flattenConcepts(chapterIds?: string[]) {
  const chapterSet = chapterIds ? new Set(chapterIds) : null;
  const out: FlatConcept[] = [];

  getPrioritizedChapters().forEach((chapter) => {
    if (chapterSet && !chapterSet.has(chapter.id)) return;

    chapter.subchapters.forEach((subchapter) => {
      subchapter.concepts.forEach((concept) => {
        out.push({
          conceptId: `${chapter.id}__${subchapter.id}__${slugify(concept)}`,
          conceptLabel: concept,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          chapterPriority: chapter.priority,
          subchapterId: subchapter.id,
          subchapterTitle: subchapter.title,
        });
      });
    });
  });

  return out;
}

export function buildDefaultPlannerTopics(chapterLimit = 4) {
  const chapters = getPrioritizedChapters().slice(0, chapterLimit);
  const total = chapters.length || 1;

  return chapters.map((chapter, idx) => {
    const concepts = chapter.subchapters.flatMap((subchapter) => subchapter.concepts);
    return {
      id: chapter.id,
      name: chapter.title,
      weight: Number(((total - idx) / ((total * (total + 1)) / 2)).toFixed(2)),
      modes: ['explain_like_interview', 'blank_page', 'flash_prompts'],
      objectives: concepts,
    };
  });
}

export function chapterConceptCount(chapter: StudyChapter) {
  return chapter.subchapters.reduce((sum, subchapter) => sum + subchapter.concepts.length, 0);
}
