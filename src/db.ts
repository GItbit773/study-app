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
  const courseCount = await db.courses.count();
  if (courseCount > 0) return; // Database already seeded

  console.log("Seeding StudyMaster persistent DB...");

  // 1. Core Courses
  const starterCourses: Course[] = [
    { id: 'FIN302', code: 'FIN 302', name: 'Corporate Finance', color: 'amber' },
    { id: 'CS301', code: 'CS 301', name: 'Distributed Systems', color: 'rose' },
    { id: 'CS302', code: 'CS 302', name: 'Database Engineering', color: 'indigo' },
    { id: 'CS310', code: 'CS 310', name: 'Artificial Intelligence', color: 'violet' },
    { id: 'CS320', code: 'CS 320', name: 'Software Architecture', color: 'emerald' },
    { id: 'MATH304', code: 'MATH 304', name: 'Linear Algebra', color: 'sky' }
  ];
  await db.courses.bulkAdd(starterCourses);

  // 2. Semester Settings
  // Set start date to Monday, June 8, 2026, so June 16, 2026 is Week 2
  await db.settings.bulkAdd([
    { key: 'semesterStartDate', value: '2026-06-08' },
    { key: 'userName', value: 'Alex Developer' }
  ]);

  // 3. Populate 13 Weeks of Topics across all 6 courses
  const now = Date.now();
  const MS_DAY = 24 * 60 * 60 * 1000;

  for (const course of starterCourses) {
    const list = COURSE_SYLLABI[course.id] || [];
    for (let w = 1; w <= 13; w++) {
      const topicTitle = list[w - 1] || `Module Topic ${w}`;
      const topicId = `topic_${course.id.toLowerCase()}_w${w}`;

      // Create high-detail custom subtopics for Week 1 & 2, standard styled templates for others
      const subTopics: SubTopic[] = [];
      const flashcards: Flashcard[] = [];

      if (w === 1) {
        // High fidelity Week 1 content
        subTopics.push(
          {
            subTopicId: `sub_${course.id.toLowerCase()}_w${w}_s1`,
            orderIndex: 0,
            title: `Core Fundamentals of ${topicTitle.split(' & ')[0]}`,
            notesMarkdown: `
# ${topicTitle} - Theoretical Foundations

Welcome to the initial core lecture of **${course.code}: ${course.name}**. Inside this module, we dissect the foundational principles that govern this domain.

### Key Conceptual Equations
We utilize specific structural modeling components:
$$\\text{Value} = \\sum_{t=1}^{n} \\frac{\\text{CF}_t}{(1 + r)^t}$$

### Detailed Core Summary
1. **Underlying Vectors**: We identify several core inputs. In ${course.name}, accuracy requires systematic analysis.
2. **Contextual Variables**: These include boundaries, system configurations, and risk coefficients.
3. **Common Traps**: Underestimating margins of error, misaligning timestamps, or referencing dangling pointer states.

*Review this guide extensively to clear the check-quiz below.*
            `.trim(),
            confidenceStatus: 'GREEN',
            nextReviewDate: new Date(now + 10 * MS_DAY).toISOString(), // Review scheduled far out
            quiz: [
              {
                question: `What is the primary factor limiting the efficiency of standard architectures in ${course.name}?`,
                options: [
                  "Improper validation margins",
                  "Over-reliance on deterministic variables without accounting for standard error distributions",
                  "Excessive database replication",
                  "None of the above"
                ],
                correctOptionIndex: 1
              },
              {
                question: "Which of these represents a critical standard design best practice?",
                options: [
                  "Document all logical constraints and enforce tight normalization bounds",
                  "Rely exclusively on dynamic client runtime parsing without verification",
                  "Ignore edge conditions and resolve in production deployments",
                  "Bypass type systems entirely"
                ],
                correctOptionIndex: 0
              }
            ],
            quizPassed: true
          },
          {
            subTopicId: `sub_${course.id.toLowerCase()}_w${w}_s2`,
            orderIndex: 1,
            title: "Advanced Implementations & Case Analysis",
            notesMarkdown: `
# Advanced Architectural Applications

This section covers the technical implementation details, trade-offs, and practical execution profiles of **${topicTitle}**.

### Important Guidelines
* **Precision Matters:** Avoid approximate states.
* **Scaling Profiles:** Analyze complexity as system boundaries grow.
* **Integration Points:** Ensure endpoints remain strictly separated.

\`\`\`typescript
// Implementation Example
function processConcept<T>(input: T): { status: string; result: T } {
  console.log("Analyzing academic matrix payload...");
  return {
    status: "COMPLETE",
    result: input
  };
}
\`\`\`
            `.trim(),
            confidenceStatus: 'RED',
            nextReviewDate: new Date(now - 1 * MS_DAY).toISOString(), // Overdue by 1 day! (Due today!)
            quiz: [
              {
                question: "In technical execution, which scaling order describes optimal efficiency?",
                options: ["Exponential growth curves", "Logarithmic or near-linear scaling profiles", "Random randomized walks", "Quadratic bottlenecks"],
                correctOptionIndex: 1
              }
            ],
            quizPassed: false
          }
        );

        flashcards.push(
          { front: `What is the defining objective of ${topicTitle}?`, back: "To establish a rigorous, mathematically sound baseline that handles realistic constraints elegantly." },
          { front: "What is the primary constraint to maintain during high-load processing?", back: "Consistency across all nodes and strict transaction isolation bound boundaries." }
        );

      } else if (w === 2) {
        // High fidelity Week 2 content
        subTopics.push(
          {
            subTopicId: `sub_${course.id.toLowerCase()}_w${w}_s1`,
            orderIndex: 0,
            title: `Practical Application of ${topicTitle}`,
            notesMarkdown: `
# ${topicTitle} - Systems & Design

In Week 2, we transition from purely theoretical definitions to active operations, structural modeling, and empirical tests.

### Advanced Formulas
* Let $r$ define the growth coefficient.
* Let $C$ represent the capacity barrier.

### Key Structural Milestones
* **Milestone 1:** Validate data-input flows.
* **Milestone 2:** Implement multi-variant logic branches.
* **Milestone 3:** Run isolation protocols to eliminate dependencies.
            `.trim(),
            confidenceStatus: 'YELLOW',
            nextReviewDate: new Date(now + 1 * MS_DAY).toISOString(), // Due tomorrow!
            quiz: [
              {
                question: "Which of these variables denotes the primary indicator of growth capacity?",
                options: ["The coefficient constant", "The terminal discount yield", "The absolute static boundary value", "None of these"],
                correctOptionIndex: 0
              }
            ],
            quizPassed: false
          }
        );

        flashcards.push(
          { front: `What is the main takeaway from Week 2 concerning ${topicTitle}?`, back: "That practical implementation requires accommodating operational turbulence and adjusting coefficients." }
        );

      } else {
        // Standard template weeks 3-13
        subTopics.push({
          subTopicId: `sub_${course.id.toLowerCase()}_w${w}_s1`,
          orderIndex: 0,
          title: "Theoretical Framework Overview",
          notesMarkdown: `
# ${topicTitle}

Welcome to Week ${w} of **${course.name}** (${course.code}).

This study guide outlines the main concepts of **${topicTitle}**.

### Topics Covered
1. Main Structural Overview and Key Axioms
2. Real-world relevance and conceptual boundaries
3. Common computational and mathematical workflows

*Use the edit button above to update these notes with information from your textbook or lecture slides!*
          `.trim(),
          confidenceStatus: 'NONE',
          nextReviewDate: null,
          quiz: [
            {
              question: "What is the standard procedure for reviewing complex modules?",
              options: [
                "Skim the titles once and proceed",
                "Review notes, perform practice self-quizzes, and rate confidence regularly",
                "Depend strictly on cramming the night before finals",
                "Omit flashcard reviews entirely"
              ],
              correctOptionIndex: 1
            }
          ],
          quizPassed: false
        });

        flashcards.push({
          front: `Define the core topic of ${course.code} Week ${w}: "${topicTitle}"`,
          back: `It refers to the study of core properties, structures, and systems related to this week's technical curriculum.`
        });
      }

      await db.topics.add({
        courseId: course.id,
        weekNumber: w,
        topicId: topicId,
        topicTitle: topicTitle,
        subTopics: subTopics,
        masterFlashcards: flashcards
      });
    }
  }

  // 4. Seeding some upcoming and completed deadlines
  const deadlines: Deadline[] = [
    {
      courseId: 'FIN302',
      title: 'Problem Set 1 (WACC Optimization)',
      dueDate: new Date(now + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now (CRITICAL)
      completed: false
    },
    {
      courseId: 'CS302',
      title: 'Normalization Lab Assignment',
      dueDate: new Date(now + 2 * MS_DAY + 3 * 60 * 60 * 1000).toISOString(), // ~2.1 days from now (APPROACHING)
      completed: false
    },
    {
      courseId: 'CS301',
      title: 'Lamport Timestamps Coding Project',
      dueDate: new Date(now + 6 * MS_DAY).toISOString(), // 6 days from now (ON-TRACK)
      completed: false
    },
    {
      courseId: 'MATH304',
      title: 'Row Reduction Worksheet',
      dueDate: new Date(now - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago but marked completed
      completed: true
    },
    {
      courseId: 'CS310',
      title: 'Midterm Coding Competition Pitch',
      dueDate: new Date(now + 1 * MS_DAY + 12 * 60 * 60 * 1000).toISOString(), // 1.5 days from now (APPROACHING)
      completed: false
    }
  ];
  await db.deadlines.bulkAdd(deadlines);

  // 5. Seeding default outstanding Urgent Review nodes
  const urgentReviewsSeed: UrgentReview[] = [
    {
      courseId: 'CS301',
      title: 'Study Network Socket Basics',
      notes: 'Lacking knowledge on TCP handshake & streaming vs packet frames',
      completed: false,
      createdAt: new Date().toISOString()
    },
    {
      courseId: 'MATH304',
      title: 'Review Matrix Determinant Formulas',
      notes: 'Need 3x3 expansion cofactor shortcut memory refresh',
      completed: true,
      createdAt: new Date(now - 12 * 60 * 60 * 1000).toISOString()
    }
  ];
  await db.urgentReviews.bulkAdd(urgentReviewsSeed);

  console.log("StudyMaster DB successfully prepared with rich curriculum content!");
}
