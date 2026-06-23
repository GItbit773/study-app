import Dexie, { type Table } from 'dexie';
import { Course, TopicRecord, Deadline, Setting, SubTopic, Flashcard, UrgentReview } from './types';

export class StudyMasterDatabase extends Dexie {
  courses!: Table<Course, string>;
  topics!: Table<TopicRecord, number>;
  deadlines!: Table<Deadline, number>;
  urgentReviews!: Table<UrgentReview, number>;
  settings!: Table<Setting, string>;

  constructor() {
    super('StudyMasterDatabase_v4');

    // Define table schemas
    this.version(1).stores({
      courses: 'id, code, name, color',
      topics: '++id, courseId, weekNumber, topicId, topicTitle',
      deadlines: '++id, courseId, dueDate, completed',
      urgentReviews: '++id, courseId, completed',
      settings: 'key, value',
    });
  }
}

export const db = new StudyMasterDatabase();

// Clean, realistic syllabus structures for 13 weeks
const COURSE_SYLLABI: Record<string, string[]> = {
  FIN302: [
    "Corporate Valuations & DCF Models",
    "Capital Budgeting & NPV Calculations",
    "Capital Structure Decisions & Leverage",
    "Cost of Capital: WACC & CAPM",
    "Dividend Strategy & Cash Payouts",
    "Mergers, Acquisitions & Synergies",
    "Corporate Governance & Board Control",
    "Working Capital Management & Cash Conversion",
    "Risk Management & Hedging Techniques",
    "Venture Capital & IPO Mechanics",
    "Debt Financing & Bond Valuations",
    "Option Pricing in Corporate Decisions",
    "Final Financial Audit Case Analysis"
  ],
  CS301: [
    "Introduction to Distributed Consensuses",
    "Time, Clocks & Lamport Logical Timestamps",
    "Raft Consensus Protocol & Leader Elections",
    "Paxos Protocol: Single vs Multi Paxos",
    "Gossip Protocols & Membership Lists",
    "Distributed Hash Tables (DHT) & Chord",
    "Vector Clocks & Version Vectors",
    "MapReduce & Distributed Data Planes",
    "Distributed File Systems: GFS & HDFS",
    "Consistent Hashing & DynamoDB Design",
    "Distributed Transactions (2PC & 3PC)",
    "Byzantine Fault Tolerance & Blockchain",
    "Designing Large-Scale Distributed Proxies"
  ],
  CS302: [
    "Relational Modeling & Normalization",
    "SQL Mastery & Query Execution Planes",
    "Indexing Strategies & B-Trees",
    "Transaction Isolation Levels & Lock Specs",
    "NoSQL Architectures & Document Stores",
    "Distributed Databases & CAP Theorem",
    "Query Optimization & Cost Estimations",
    "Graph Databases & Cypher Mechanics",
    "Data Warehousing & OLAP Cubes",
    "Concurrency Control & MVCC",
    "Database Backups & Replication topologies",
    "Sharding and Partitioning",
    "Final Project Defense & DB Operations"
  ],
  CS310: [
    "Heuristic Search: A* & Minimax",
    "Constraint Satisfaction Problems",
    "Markov Decision Processes & Bellman Equations",
    "Q-Learning & Reinforcement Learning",
    "Neural Network Foundations & Backprop",
    "Convolutional Networks & Image Kernels",
    "Recurrent Networks & Sequence Models",
    "Transformer Architectures & Self-Attention",
    "Language Models & Prompt Engineering",
    "Probability & Bayesian Classification",
    "Support Vector Machines & Kernel Tree",
    "K-Means Clustering & Dimensionality",
    "Ethics, Alignment & Multi-Agent Futures"
  ],
  CS320: [
    "Monolithic vs Microservice Tradeoffs",
    "Domain-Driven Design & Bounded Contexts",
    "Event-Driven Systems & Kafka Streaming",
    "CQRS & Event Sourcing Patterns",
    "REST, gRPC, and GraphQL Protocol Suites",
    "API Gateways, Load Balancing & Sidecars",
    "Caching Strategies & Cache Invalidation",
    "Circuit Breakers, Retries, and Rate Limits",
    "Service Mesh Models & Envoy Proxy Routing",
    "Database Sharding & Replia Architecture",
    "Observability: Traces, Metrics, and Logs",
    "Clean Architecture & Hexagonal Ports",
    "Security Architecture: OAuth2, JWT & Mutual TLS"
  ],
  MATH304: [
    "Systems of Linear Equations & Row Reduction",
    "Vector Spaces, Subspaces & Linear Span",
    "Linear Independence, Bases & Dimensions",
    "Linear Transformations & Matrix Rep",
    "Matrix Multiplication & Inverse Properties",
    "Determinants & Cramer's Rule Mechanics",
    "Eigenvalues, Eigenvectors & Characteristics",
    "Diagonalization of Symmetric Matrices",
    "Inner Product Spaces & Gram-Schmidt Process",
    "Orthogonal Projections & Least Squares",
    "Singular Value Decomposition (SVD)",
    "Quadratic Forms & Positive Definite",
    "Applications of Linearity in PageRank"
  ]
};

// Seeding engine
export async function seedDatabase() {
  const settingsCount = await db.settings.count();
  if (settingsCount > 0) return; // Database already seeded with settings

  console.log("Seeding StudyMaster settings...");

  // Seed standard default settings
  await db.settings.bulkAdd([
    { key: 'semesterStartDate', value: '2026-06-08' },
    { key: 'userName', value: 'Alex' }
  ]);

  console.log("StudyMaster DB successfully initialized with an empty blank slate!");
}
