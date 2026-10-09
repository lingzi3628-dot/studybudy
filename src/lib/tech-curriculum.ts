/**
 * AI / Machine Learning / Tech Curriculum — Phase 10
 *
 * A comprehensive, structured curriculum for AI, ML, Data Science, Web Dev,
 * and DevOps courses. Used by:
 *   1. The AI Tutor's context builder — so the tutor knows what topics
 *      belong to each tech course + can teach them systematically.
 *   2. The curriculum engine — for topic validation (is this topic in the
 *      course curriculum?).
 *   3. Course seeding — the admin can seed CourseKnowledge rows from this
 *      data so RAG retrieval works for tech students.
 *
 * Structure mirrors curriculum-engine.ts (Kenya CBC) but for tech tracks:
 *   - Each "course" is a track (e.g. "AI & Machine Learning")
 *   - Each course has modules (like subjects)
 *   - Each module has lessons with learning outcomes + content
 *
 * Levels:
 *   - Beginner: intro concepts, no math beyond algebra
 *   - Intermediate: supervised/unsupervised ML, basic neural networks
 *   - Advanced: deep learning, NLP, MLOps, deployment
 */

export type TechModule = {
  name: string;
  description: string;
  lessons: Array<{
    title: string;
    summary: string;
    learningOutcomes: string[];
    keyConcepts: string[];
    handsOn?: string; // suggested code playground exercise
    difficulty: "beginner" | "intermediate" | "advanced";
  }>;
};

export type TechCourse = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  modules: TechModule[];
};

// ============================================================
// Course 1: AI & Machine Learning
// ============================================================

export const AI_ML_COURSE: TechCourse = {
  id: "ai-ml",
  name: "AI & Machine Learning",
  description: "From 'What is AI?' to training neural networks — a complete track for aspiring AI engineers.",
  emoji: "🤖",
  modules: [
    // --- Module 1: Intro to AI ---
    {
      name: "Introduction to AI",
      description: "What AI is, types of AI, history, real-world applications, ethics.",
      lessons: [
        {
          title: "What is Artificial Intelligence?",
          summary: "AI is the science of making machines that can perceive, reason, and act — tasks that normally require human intelligence.",
          learningOutcomes: [
            "Define AI and distinguish it from traditional programming",
            "Identify the three types of AI: narrow, general, super",
            "List 5 real-world AI applications",
          ],
          keyConcepts: ["Narrow AI", "General AI", "Turing Test", "Intelligence", "Automation"],
          handsOn: "Write a Python program that simulates a simple rule-based chatbot (if/else rules).",
          difficulty: "beginner",
        },
        {
          title: "History of AI",
          summary: "From the Dartmouth Conference (1956) to deep learning and LLMs — the key milestones.",
          learningOutcomes: [
            "Describe the AI winters and what caused them",
            "Explain why deep learning took off after 2012",
            "Identify key figures: Turing, McCarthy, Hinton, LeCun, Bengio",
          ],
          keyConcepts: ["Dartmouth Conference", "Expert Systems", "Deep Learning", "ImageNet", "GPT"],
          difficulty: "beginner",
        },
        {
          title: "AI Ethics & Bias",
          summary: "AI systems can perpetuate bias, invade privacy, and concentrate power. Ethical AI is everyone's responsibility.",
          learningOutcomes: [
            "Explain algorithmic bias with a real example",
            "List 3 principles of responsible AI",
            "Describe the trolley problem in the context of self-driving cars",
          ],
          keyConcepts: ["Bias", "Fairness", "Privacy", "Transparency", "Accountability"],
          handsOn: "Write a Python function that checks if a loan approval dataset has gender bias (compare approval rates by group).",
          difficulty: "beginner",
        },
      ],
    },
    // --- Module 2: ML Fundamentals ---
    {
      name: "Machine Learning Fundamentals",
      description: "Supervised vs unsupervised learning, training/testing, overfitting, feature engineering.",
      lessons: [
        {
          title: "What is Machine Learning?",
          summary: "ML is learning patterns from data instead of being explicitly programmed. The model improves with more data.",
          learningOutcomes: [
            "Distinguish supervised, unsupervised, and reinforcement learning",
            "Explain the difference between features and labels",
            "Describe the train/test split and why it matters",
          ],
          keyConcepts: ["Supervised", "Unsupervised", "Reinforcement", "Features", "Labels", "Train/Test Split"],
          handsOn: "Write Python code to split a list of numbers into training (80%) and testing (20%) sets.",
          difficulty: "beginner",
        },
        {
          title: "Linear Regression",
          summary: "The simplest ML algorithm — fitting a line to data points using least squares.",
          learningOutcomes: [
            "Explain the equation y = mx + b in the context of ML",
            "Implement gradient descent from scratch in Python",
            "Evaluate a regression model using MSE and R²",
          ],
          keyConcepts: ["Slope", "Intercept", "Least Squares", "Gradient Descent", "MSE", "R²"],
          handsOn: "Implement linear regression with numpy: generate noisy data, fit a line, plot with matplotlib.",
          difficulty: "intermediate",
        },
        {
          title: "Overfitting & Regularization",
          summary: "A model that memorizes the training data but fails on new data is overfit. Regularization prevents this.",
          learningOutcomes: [
            "Explain overfitting with a visual analogy",
            "Compare L1 (Lasso) and L2 (Ridge) regularization",
            "Use cross-validation to detect overfitting",
          ],
          keyConcepts: ["Overfitting", "Underfitting", "Bias-Variance Tradeoff", "L1", "L2", "Cross-Validation"],
          handsOn: "Train a polynomial regression model with degree 1 vs degree 20. Plot both. Which overfits?",
          difficulty: "intermediate",
        },
        {
          title: "Classification: Logistic Regression & Decision Trees",
          summary: "Predicting categories — spam vs not-spam, disease vs healthy. Two foundational algorithms.",
          learningOutcomes: [
            "Explain the sigmoid function and why it's used for classification",
            "Build a decision tree and interpret its splits",
            "Evaluate classifiers with accuracy, precision, recall, F1",
          ],
          keyConcepts: ["Sigmoid", "Decision Boundary", "Entropy", "Information Gain", "Precision", "Recall", "F1"],
          handsOn: "Use scikit-learn to train a decision tree on the Iris dataset. Print the confusion matrix.",
          difficulty: "intermediate",
        },
      ],
    },
    // --- Module 3: Neural Networks ---
    {
      name: "Neural Networks & Deep Learning",
      description: "Perceptrons, layers, activation functions, backpropagation, CNNs.",
      lessons: [
        {
          title: "The Perceptron",
          summary: "The building block of neural networks — a single neuron that makes a binary decision.",
          learningOutcomes: [
            "Explain how a perceptron computes its output (weighted sum + activation)",
            "Implement a perceptron from scratch in Python",
            "Describe why a single perceptron can't learn XOR",
          ],
          keyConcepts: ["Weights", "Bias", "Activation Function", "Step Function", "Linear Separability"],
          handsOn: "Implement a perceptron class in Python that learns AND/OR gates. Show it fails on XOR.",
          difficulty: "intermediate",
        },
        {
          title: "Multi-Layer Networks & Backpropagation",
          summary: "Stacking neurons in layers + propagating errors backward to update weights = deep learning.",
          learningOutcomes: [
            "Describe forward propagation (input → hidden → output)",
            "Explain backpropagation using the chain rule",
            "Implement a 2-layer network that solves XOR",
          ],
          keyConcepts: ["Hidden Layer", "ReLU", "Sigmoid", "Chain Rule", "Gradient Descent", "Loss Function"],
          handsOn: "Build a 2-layer neural network in numpy (no framework) that learns XOR. Plot the loss curve.",
          difficulty: "advanced",
        },
        {
          title: "Convolutional Neural Networks (CNNs)",
          summary: "CNNs use filters to detect patterns in images — edges, shapes, objects. The backbone of computer vision.",
          learningOutcomes: [
            "Explain what a convolution operation does to an image",
            "Describe pooling, padding, and strides",
            "Build a simple CNN for digit classification (MNIST)",
          ],
          keyConcepts: ["Convolution", "Filter/Kernel", "Pooling", "Feature Map", "Flatten", "Softmax"],
          handsOn: "Write TensorFlow.js code (or Python/Keras) for a CNN that classifies MNIST digits.",
          difficulty: "advanced",
        },
      ],
    },
    // --- Module 4: Practical ML ---
    {
      name: "Practical ML with scikit-learn",
      description: "Hands-on ML with real datasets — the full pipeline from data to model.",
      lessons: [
        {
          title: "The ML Pipeline",
          summary: "Data loading → cleaning → feature engineering → model selection → training → evaluation → deployment.",
          learningOutcomes: [
            "Describe the 7 steps of the ML pipeline",
            "Explain why data cleaning takes 60-80% of ML project time",
            "Choose the right algorithm for a given problem type",
          ],
          keyConcepts: ["EDA", "Feature Engineering", "Model Selection", "Hyperparameter Tuning", "Deployment"],
          handsOn: "Write Python code to load a CSV, handle missing values, encode categorical variables, and train a random forest.",
          difficulty: "intermediate",
        },
        {
          title: "Clustering: K-Means",
          summary: "Unsupervised learning — finding groups in data without labels.",
          learningOutcomes: [
            "Explain how K-Means iteratively assigns points to clusters",
            "Choose the right K using the elbow method",
            "Apply K-Means to customer segmentation",
          ],
          keyConcepts: ["Centroid", "Inertia", "Elbow Method", "Silhouette Score", "Unsupervised"],
          handsOn: "Generate synthetic 2D data with 3 clusters. Run K-Means with sklearn. Plot the clusters + centroids.",
          difficulty: "intermediate",
        },
      ],
    },
    // --- Module 5: LLMs & Generative AI ---
    {
      name: "LLMs & Generative AI",
      description: "How large language models work, prompt engineering, RAG, fine-tuning.",
      lessons: [
        {
          title: "How Large Language Models Work",
          summary: "Transformers, attention, next-token prediction — the architecture behind GPT, BERT, and Llama.",
          learningOutcomes: [
            "Explain the transformer architecture at a high level",
            "Describe self-attention and why it's powerful",
            "Explain tokenization and why it matters",
          ],
          keyConcepts: ["Transformer", "Self-Attention", "Tokenization", "Embeddings", "Next-Token Prediction"],
          difficulty: "advanced",
        },
        {
          title: "Prompt Engineering",
          summary: "The art of talking to AI — crafting prompts that get useful, accurate responses.",
          learningOutcomes: [
            "Write effective prompts using the CRISP framework",
            "Use few-shot examples to guide AI output",
            "Chain prompts for complex multi-step tasks",
          ],
          keyConcepts: ["Zero-shot", "Few-shot", "Chain-of-Thought", "System Prompt", "Temperature"],
          handsOn: "Write 3 different prompts for the same task. Compare the outputs. Which works best + why?",
          difficulty: "beginner",
        },
        {
          title: "RAG: Retrieval-Augmented Generation",
          summary: "Give the AI your own documents so it answers from YOUR data, not just its training data.",
          learningOutcomes: [
            "Explain the RAG pipeline: chunk → embed → retrieve → augment → generate",
            "Describe why RAG is cheaper than fine-tuning",
            "Identify when to use RAG vs fine-tuning vs prompt engineering",
          ],
          keyConcepts: ["Embeddings", "Vector Database", "Chunking", "Cosine Similarity", "Retrieval"],
          difficulty: "advanced",
        },
      ],
    },
  ],
};

// ============================================================
// Course 2: Data Science
// ============================================================

export const DATA_SCIENCE_COURSE: TechCourse = {
  id: "data-science",
  name: "Data Science",
  description: "Data cleaning, visualization, EDA, SQL, pandas, statistics — the full data toolkit.",
  emoji: "📊",
  modules: [
    {
      name: "Python for Data Science",
      description: "numpy, pandas, matplotlib — the holy trinity of data science.",
      lessons: [
        {
          title: "NumPy: Arrays & Vectorized Operations",
          summary: "NumPy replaces Python loops with fast C-level array operations. The foundation of all data science in Python.",
          learningOutcomes: [
            "Create and manipulate NumPy arrays",
            "Explain why vectorized operations are 100x faster than loops",
            "Use broadcasting to operate on arrays of different shapes",
          ],
          keyConcepts: ["ndarray", "Vectorization", "Broadcasting", "Shape", "Dtype"],
          handsOn: "Create a 1000x1000 matrix. Time element-wise multiplication with a loop vs numpy. Compare.",
          difficulty: "beginner",
        },
        {
          title: "Pandas: DataFrames & Data Manipulation",
          summary: "Pandas is Excel on steroids — load, filter, group, merge, and transform tabular data.",
          learningOutcomes: [
            "Load CSV/Excel into a DataFrame",
            "Filter, sort, and group data",
            "Handle missing values + merge multiple DataFrames",
          ],
          keyConcepts: ["DataFrame", "Series", "GroupBy", "Merge", "Pivot Table", "Missing Values"],
          handsOn: "Load a CSV of student grades. Find the average per subject. Plot a bar chart of averages.",
          difficulty: "intermediate",
        },
        {
          title: "Matplotlib & Data Visualization",
          summary: "A picture is worth 1000 data points — choosing the right chart for your data.",
          learningOutcomes: [
            "Create bar, line, scatter, and histogram plots",
            "Choose the right chart type for different data types",
            "Add labels, titles, legends, and color schemes",
          ],
          keyConcepts: ["Bar Chart", "Line Plot", "Scatter", "Histogram", "Box Plot", "Subplots"],
          handsOn: "Generate random height/weight data. Create a scatter plot with a trend line.",
          difficulty: "beginner",
        },
      ],
    },
    {
      name: "Statistics for Data Science",
      description: "Mean, median, variance, distributions, hypothesis testing — the math behind the data.",
      lessons: [
        {
          title: "Descriptive Statistics",
          summary: "Mean, median, mode, variance, standard deviation — summarizing data with numbers.",
          learningOutcomes: [
            "Calculate mean, median, mode for a dataset",
            "Explain when median is better than mean (skewed data)",
            "Compute variance and standard deviation",
          ],
          keyConcepts: ["Mean", "Median", "Mode", "Variance", "Standard Deviation", "Quartiles"],
          handsOn: "Generate exam scores for 100 students. Calculate all descriptive stats. Plot a histogram.",
          difficulty: "beginner",
        },
        {
          title: "Probability Distributions",
          summary: "Normal, binomial, Poisson — understanding the shapes data takes.",
          learningOutcomes: [
            "Describe the normal distribution and the 68-95-99.7 rule",
            "Explain when to use binomial vs Poisson distributions",
            "Calculate probabilities using the Z-score",
          ],
          keyConcepts: ["Normal Distribution", "Binomial", "Poisson", "Z-Score", "p-value"],
          handsOn: "Simulate 1000 coin flips. Plot the distribution. Does it match the binomial?",
          difficulty: "intermediate",
        },
      ],
    },
    {
      name: "SQL for Data Science",
      description: "Querying databases — SELECT, JOIN, GROUP BY, window functions.",
      lessons: [
        {
          title: "SQL Basics: SELECT, WHERE, ORDER BY",
          summary: "The foundational SQL commands every data scientist needs.",
          learningOutcomes: [
            "Write SELECT queries with WHERE filters",
            "Sort results with ORDER BY",
            "Limit results with LIMIT/OFFSET",
          ],
          keyConcepts: ["SELECT", "WHERE", "ORDER BY", "LIMIT", "DISTINCT"],
          handsOn: "Write SQL to find the top 10 highest-paid employees in a company database.",
          difficulty: "beginner",
        },
        {
          title: "JOINs & Aggregation",
          summary: "Combine tables with JOINs + summarize with GROUP BY + HAVING.",
          learningOutcomes: [
            "Explain INNER, LEFT, RIGHT, and FULL JOINs",
            "Use GROUP BY with COUNT, SUM, AVG, MIN, MAX",
            "Filter aggregated results with HAVING",
          ],
          keyConcepts: ["INNER JOIN", "LEFT JOIN", "GROUP BY", "HAVING", "Aggregate Functions"],
          handsOn: "Write SQL to find the average order value per customer, sorted by highest first.",
          difficulty: "intermediate",
        },
      ],
    },
  ],
};

// ============================================================
// Course 3: Web Development
// ============================================================

export const WEB_DEV_COURSE: TechCourse = {
  id: "web-dev",
  name: "Web Development",
  description: "HTML, CSS, JavaScript, React, APIs, deployment — build real websites from scratch.",
  emoji: "🌐",
  modules: [
    {
      name: "HTML & CSS Foundations",
      description: "Structure + style — the skeleton and skin of every website.",
      lessons: [
        {
          title: "HTML Structure",
          summary: "Tags, elements, attributes, semantic HTML — building the structure of a web page.",
          learningOutcomes: [
            "Write a complete HTML5 document with proper structure",
            "Use semantic tags: header, nav, main, section, footer",
            "Add images, links, lists, and forms",
          ],
          keyConcepts: ["Tags", "Elements", "Attributes", "Semantic HTML", "Forms", "Accessibility"],
          handsOn: "Build a personal portfolio page with header, about section, gallery, and contact form.",
          difficulty: "beginner",
        },
        {
          title: "CSS Styling & Layout",
          summary: "Colors, fonts, flexbox, grid, responsive design — making sites look good on any device.",
          learningOutcomes: [
            "Use CSS variables for theming",
            "Build layouts with Flexbox and CSS Grid",
            "Make a page responsive with media queries",
          ],
          keyConcepts: ["Selectors", "Flexbox", "CSS Grid", "Media Queries", "Box Model", "CSS Variables"],
          handsOn: "Style the portfolio page from the previous lesson. Make it responsive (mobile + desktop).",
          difficulty: "beginner",
        },
      ],
    },
    {
      name: "JavaScript Essentials",
      description: "Variables, functions, DOM manipulation, events — making pages interactive.",
      lessons: [
        {
          title: "JavaScript Basics",
          summary: "Variables, data types, functions, conditionals, loops — the building blocks.",
          learningOutcomes: [
            "Declare variables with let/const and understand scope",
            "Write functions (declarations, arrows, callbacks)",
            "Use conditionals + loops effectively",
          ],
          keyConcepts: ["Variables", "Functions", "Scope", "Arrow Functions", "Template Literals"],
          handsOn: "Write a JavaScript program that takes a list of numbers and returns the sum, average, and max.",
          difficulty: "beginner",
        },
        {
          title: "DOM Manipulation & Events",
          summary: "Select elements, change content, listen for clicks — make pages come alive.",
          learningOutcomes: [
            "Use querySelector + getElementById to select elements",
            "Add event listeners for clicks, input, and keyboard",
            "Dynamically create and append HTML elements",
          ],
          keyConcepts: ["DOM", "querySelector", "addEventListener", "innerHTML", "createElement"],
          handsOn: "Build a todo list app: add items, mark complete, delete items. All in vanilla JS.",
          difficulty: "intermediate",
        },
      ],
    },
    {
      name: "React & Modern Frontend",
      description: "Components, state, hooks, API calls — building reactive UIs.",
      lessons: [
        {
          title: "React Components & Props",
          summary: "Build reusable UI components that receive data via props.",
          learningOutcomes: [
            "Create a functional React component",
            "Pass data between components with props",
            "Use JSX to write HTML-in-JS",
          ],
          keyConcepts: ["Component", "Props", "JSX", "Conditional Rendering", "Lists"],
          difficulty: "intermediate",
        },
        {
          title: "State & Hooks",
          summary: "useState, useEffect, useRef — managing data that changes over time.",
          learningOutcomes: [
            "Use useState to manage component state",
            "Fetch data from an API with useEffect",
            "Optimize renders with useMemo + useCallback",
          ],
          keyConcepts: ["useState", "useEffect", "useRef", "useMemo", "useCallback", "Dependency Array"],
          difficulty: "advanced",
        },
      ],
    },
    {
      name: "Backend & APIs",
      description: "REST APIs, Node.js, databases, authentication.",
      lessons: [
        {
          title: "REST API Design",
          summary: "GET, POST, PUT, DELETE — the verbs of the web. Design clean, predictable APIs.",
          learningOutcomes: [
            "Design a RESTful API with proper status codes",
            "Explain the difference between GET and POST",
            "Use HTTP headers for auth + content negotiation",
          ],
          keyConcepts: ["REST", "HTTP Methods", "Status Codes", "JSON", "Headers", "Authentication"],
          handsOn: "Design a REST API for a blog: list posts, get post, create post, update, delete. Write the route signatures.",
          difficulty: "intermediate",
        },
        {
          title: "Databases & SQL",
          summary: "Relational databases, tables, relationships, normalization.",
          learningOutcomes: [
            "Design a database schema with proper relationships",
            "Explain 1:1, 1:N, and N:M relationships",
            "Normalize a database to 3NF",
          ],
          keyConcepts: ["Primary Key", "Foreign Key", "Normalization", "1NF", "2NF", "3NF"],
          difficulty: "intermediate",
        },
      ],
    },
  ],
};

// ============================================================
// Course 4: DevOps & Cloud
// ============================================================

export const DEVOPS_COURSE: TechCourse = {
  id: "devops-cloud",
  name: "DevOps & Cloud",
  description: "Linux, Docker, CI/CD, cloud deployment — ship code like a professional.",
  emoji: "☁️",
  modules: [
    {
      name: "Linux & Command Line",
      description: "Navigation, file management, permissions, shell scripting.",
      lessons: [
        {
          title: "Linux Basics",
          summary: "Navigate the file system, manage files, understand permissions — the foundation of all server work.",
          learningOutcomes: [
            "Navigate with cd, ls, pwd",
            "Create/copy/move/delete files with touch, cp, mv, rm",
            "Understand file permissions (chmod, chown)",
          ],
          keyConcepts: ["Shell", "Path", "Permissions", "chmod", "sudo", "Home Directory"],
          handsOn: "Write shell commands to: create a project folder, add 3 files, make them executable, list with permissions.",
          difficulty: "beginner",
        },
      ],
    },
    {
      name: "Docker & Containers",
      description: "Package your app + its dependencies into a portable container.",
      lessons: [
        {
          title: "Docker Basics",
          summary: "Dockerfile, build, run — containerize a simple app.",
          learningOutcomes: [
            "Write a Dockerfile for a Node.js app",
            "Build and run a container",
            "Explain images vs containers",
          ],
          keyConcepts: ["Dockerfile", "Image", "Container", "Build", "Run", "Port Mapping"],
          handsOn: "Write a Dockerfile that runs a simple Python Flask app. Build + run it.",
          difficulty: "intermediate",
        },
      ],
    },
    {
      name: "CI/CD & Deployment",
      description: "Automate testing + deployment with GitHub Actions + Vercel.",
      lessons: [
        {
          title: "Continuous Deployment",
          summary: "Push to git → automatic test → automatic deploy. The modern development workflow.",
          learningOutcomes: [
            "Explain the CI/CD pipeline",
            "Set up a GitHub Actions workflow",
            "Deploy a Next.js app to Vercel",
          ],
          keyConcepts: ["CI", "CD", "GitHub Actions", "Vercel", "Environment Variables", "Preview Deployments"],
          difficulty: "advanced",
        },
      ],
    },
  ],
};

// ============================================================
// Export all courses
// ============================================================

export const TECH_COURSES: TechCourse[] = [
  AI_ML_COURSE,
  DATA_SCIENCE_COURSE,
  WEB_DEV_COURSE,
  DEVOPS_COURSE,
];

/**
 * Get a tech course by ID.
 */
export function getTechCourse(courseId: string): TechCourse | null {
  return TECH_COURSES.find((c) => c.id === courseId) ?? null;
}

/**
 * Find a lesson by title across all tech courses.
 * Used by the AI Tutor to check if a topic is in the tech curriculum.
 */
export function findTechLesson(topic: string): {
  course: string;
  module: string;
  lesson: TechModule["lessons"][0];
} | null {
  const query = topic.toLowerCase().trim();
  for (const course of TECH_COURSES) {
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        if (
          lesson.title.toLowerCase().includes(query) ||
          query.includes(lesson.title.toLowerCase()) ||
          lesson.keyConcepts.some((k) => k.toLowerCase().includes(query) || query.includes(k.toLowerCase()))
        ) {
          return { course: course.name, module: mod.name, lesson };
        }
      }
    }
  }
  return null;
}

/**
 * Build a curriculum context string for the AI Tutor.
 * This is appended to the system prompt for tech-track students so
 * the AI knows what topics are available + can teach them systematically.
 */
export function buildTechCurriculumContext(courseName: string): string {
  const course = TECH_COURSES.find(
    (c) => c.name.toLowerCase().includes(courseName.toLowerCase()) ||
           c.id === courseName.toLowerCase(),
  );
  if (!course) return "";

  const lines: string[] = [
    `=== TECH CURRICULUM: ${course.name} ===`,
    course.description,
    "",
  ];

  for (const mod of course.modules) {
    lines.push(`Module: ${mod.name}`);
    lines.push(`  ${mod.description}`);
    for (const lesson of mod.lessons) {
      lines.push(`  - ${lesson.title} (${lesson.difficulty})`);
      lines.push(`    Concepts: ${lesson.keyConcepts.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("When the learner asks about any of these topics, teach it using the curriculum structure above.");
  lines.push("Suggest hands-on code exercises when appropriate (the 'handsOn' field has ideas).");
  lines.push("Use the code_playground fence to open an interactive coding exercise when the learner wants to practice.");
  lines.push("=== END TECH CURRICULUM ===");

  return lines.join("\n");
}
