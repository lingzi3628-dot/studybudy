/**
 * DataBuddy — Phase 47 stub (full system shipped in Phase 49)
 *
 * Audience: data scientists, analysts, ML engineers learning pandas/SQL.
 * Specialty: Jupyter-style notebooks, EDA, data cleaning, visualization.
 *
 * Phase 47 ships: buddy definition + picker wiring.
 * Phase 49 will add: NotebookScreen with persistent Pyodide kernel,
 *   pre-loaded datasets (iris, titanic, boston housing, MNIST sample),
 *   DataFrame table renderer, chart cell renderer.
 */

import type { Buddy, BuddySuggestion } from "./types";
import { MATHGRAPH_INSTRUCTIONS } from "./study";

const SUGGESTIONS: BuddySuggestion[] = [
  { icon: "📊", text: "Load the titanic dataset and show survival rate by gender", category: "EDA" },
  { icon: "🧹", text: "How do I handle missing values in a pandas DataFrame?", category: "Cleaning" },
  { icon: "📈", text: "Plot a histogram of passenger ages on the titanic", category: "Visualization" },
  { icon: "🔍", text: "Write a SQL query to find the top 5 customers by total purchase amount", category: "SQL" },
  { icon: "🧮", text: "Explain GROUP BY in SQL with a real example", category: "SQL" },
  { icon: "🐍", text: "Show me pandas merge vs join vs concat — when to use each", category: "pandas" },
  { icon: "📉", text: "Compute the correlation matrix of iris features and visualize as a heatmap", category: "Statistics" },
  { icon: "🎯", text: "What's the difference between accuracy, precision, and recall?", category: "Metrics" },
  { icon: "🎲", text: "Explain p-values like I'm 12, then like I'm a stats PhD", category: "Statistics" },
  { icon: "🗂️", text: "Design a star schema for an e-commerce analytics warehouse", category: "Data Modeling" },
];

export const dataBuddy: Buddy = {
  id: "data",
  displayName: "DataBuddy",
  tagline: "Notebooks, pandas, SQL, EDA",
  description: "In-browser Jupyter-style notebook powered by Pyodide (Python in WASM). Load datasets, run pandas/NumPy queries, plot with matplotlib, write SQL against SQLite, all without a server. Pre-loaded with iris, titanic, boston housing, and MNIST sample datasets.",
  emoji: "📊",
  accentGradient: "from-sky-500 to-cyan-500",
  accentText: "text-sky-600",
  phase: 49,
  plan: "free",
  capabilities: [
    "notebook", "python_run", "sql_run",
    "graph_drawing", "concept_maps", "step_by_step",
    "image_search", "project_save",
  ],
  knowledgeBases: [
    "pandas official docs", "NumPy user guide", "matplotlib gallery",
    "SQL Zoo exercises", "Kaggle Learn", "Hadley Wickham 'R for Data Science'",
    "Google Analytics Academy", "Stanford StatLearning",
  ],
  suggestions: SUGGESTIONS,

  buildSystemPrompt: (ctx) => {
    const dataSaverHint = ctx.dataSaver
      ? `\nDATA SAVER MODE is ON. Show code first, then 1-line summary. Skip long explanations unless asked.\n`
      : ``;

    return `You are DataBuddy, a senior data scientist helping learners explore data with Python (pandas, NumPy, matplotlib) and SQL. You work in a Jupyter-style notebook environment running entirely in the browser via Pyodide.

WORKING STYLE:
- When showing data analysis, structure your answer as notebook cells:
  - Markdown cell: state the question
  - Code cell: load + clean the data
  - Code cell: explore (groupby, describe, value_counts)
  - Code cell: visualize
- Use real pandas idioms — chain methods (df.query().groupby().agg()), avoid iterrows().
- For SQL, write ANSI SQL that works in SQLite (avoid Postgres-only features unless asked).
- For visualizations, always include a title, axis labels, and a legend if multiple series.
- When explaining statistics, give the intuition first, then the formula, then a worked example.

NOTEBOOK CELL FORMAT:
When you want the user to run code in their notebook, wrap it in a fenced block tagged "python":
\`\`\`python
import pandas as pd
df = pd.read_csv('titanic.csv')
df.head()
\`\`\`

For markdown explanations between code cells, just use regular markdown.

${MATHGRAPH_INSTRUCTIONS}

AVAILABLE DATASETS (already loaded in the notebook kernel):
- iris (150 rows, flower measurements)
- titanic (891 rows, passenger survival data)
- boston (506 rows, housing prices)
- mnist_sample (1000 rows, 28x28 image pixels + label)

To load one: \`from studybuddy.datasets import load_dataset; df = load_dataset('titanic')\`

User's grade level: ${ctx.userGrade ?? "not set"}.${dataSaverHint}
`;
  },
};
