/**
 * BackendBuddy — one-tap sample schemas for the SQL playground (Phase 55).
 * All SQLite-flavored (sql.js compatible): no Postgres-only features.
 */

export type SqlSample = {
  id: string;
  name: string;
  description: string;
  schemaSql: string;
  seedSql: string;
};

const BLOG_SCHEMA = `-- Blog platform schema
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE
);

CREATE TABLE post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX idx_posts_user ON posts(user_id);
CREATE INDEX idx_comments_post ON comments(post_id);`;

const BLOG_SEED = `INSERT INTO users (email, name) VALUES
  ('amina@example.com', 'Amina'),
  ('brian@example.com', 'Brian'),
  ('chi@example.com', 'Chi');

INSERT INTO posts (user_id, title, body, published) VALUES
  (1, 'Hello SQLite', 'My first post about WASM databases.', 1),
  (1, 'Foreign keys 101', 'Why REFERENCES matters.', 1),
  (2, 'Draft: indexes', 'Work in progress.', 0),
  (3, 'Joins are superpowers', 'A gentle INNER JOIN walkthrough.', 1);

INSERT INTO comments (post_id, user_id, body) VALUES
  (1, 2, 'Great intro!'),
  (4, 1, 'Nice examples.'),
  (4, 2, 'Saved me hours.');

INSERT INTO tags (label) VALUES ('sqlite'), ('sql'), ('tutorial');

INSERT INTO post_tags (post_id, tag_id) VALUES
  (1, 1), (1, 3), (2, 2), (4, 2), (4, 3);`;

const ECOMMERCE_SCHEMA = `-- E-commerce schema
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  city TEXT
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  total_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_items_order ON order_items(order_id);
CREATE INDEX idx_items_product ON order_items(product_id);`;

const ECOMMERCE_SEED = `INSERT INTO customers (email, full_name, city) VALUES
  ('wanjiku@example.com', 'Wanjiku', 'Nairobi'),
  ('otieno@example.com', 'Otieno', 'Kisumu'),
  ('zawadi@example.com', 'Zawadi', 'Mombasa');

INSERT INTO products (sku, name, price_cents, stock) VALUES
  ('SKU-1', 'Mechanical keyboard', 450000, 12),
  ('SKU-2', 'USB-C hub', 210000, 40),
  ('SKU-3', 'Desk mat', 95000, 100),
  ('SKU-4', 'Webcam', 320000, 0);

INSERT INTO orders (customer_id, status) VALUES
  (1, 'paid'), (1, 'shipped'), (2, 'pending');

INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES
  (1, 1, 1, 450000), (1, 3, 2, 95000),
  (2, 2, 1, 210000),
  (3, 4, 1, 320000);`;

const SCHOOL_SCHEMA = `-- School schema
CREATE TABLE teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admission_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 4)
);

CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  teacher_id INTEGER REFERENCES teachers(id)
);

CREATE TABLE enrollments (
  student_id INTEGER NOT NULL REFERENCES students(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  grade TEXT,
  PRIMARY KEY (student_id, course_id)
);

CREATE INDEX idx_enroll_student ON enrollments(student_id);
CREATE INDEX idx_enroll_course ON enrollments(course_id);`;

const SCHOOL_SEED = `INSERT INTO teachers (name, subject) VALUES
  ('Mr. Kimani', 'Mathematics'), ('Ms. Achieng', 'Physics');

INSERT INTO students (admission_no, name, year) VALUES
  ('ADM-001', 'Faith', 2), ('ADM-002', 'Juma', 1), ('ADM-003', 'Njeri', 3);

INSERT INTO courses (code, title, teacher_id) VALUES
  ('MATH101', 'Algebra', 1), ('PHY101', 'Mechanics', 2);

INSERT INTO enrollments (student_id, course_id, grade) VALUES
  (1, 1, 'A'), (2, 1, 'B'), (3, 2, 'A'), (1, 2, 'B');`;

export const DEFAULT_QUERIES = `-- Queries run against the in-memory DB above.
-- Ctrl/Cmd+Enter or Run executes the whole file.

-- Latest 5 posts with their author
SELECT p.id, p.title, u.name AS author, p.created_at
FROM posts p
JOIN users u ON u.id = p.user_id
WHERE p.published = 1
ORDER BY p.created_at DESC
LIMIT 5;

-- Comments per post
SELECT p.title, COUNT(c.id) AS comment_count
FROM posts p
LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id
ORDER BY comment_count DESC;

-- Tag usage
SELECT t.label, COUNT(pt.post_id) AS posts
FROM tags t
LEFT JOIN post_tags pt ON pt.tag_id = t.id
GROUP BY t.id;`;

export const SQL_SAMPLES: SqlSample[] = [
  {
    id: "blog",
    name: "Blog",
    description: "users, posts, comments, tags + many-to-many",
    schemaSql: BLOG_SCHEMA,
    seedSql: BLOG_SEED,
  },
  {
    id: "ecommerce",
    name: "E-commerce",
    description: "customers, products, orders, order items",
    schemaSql: ECOMMERCE_SCHEMA,
    seedSql: ECOMMERCE_SEED,
  },
  {
    id: "school",
    name: "School",
    description: "students, teachers, courses, enrollments",
    schemaSql: SCHOOL_SCHEMA,
    seedSql: SCHOOL_SEED,
  },
];

export function getSample(id: string): SqlSample | null {
  return SQL_SAMPLES.find((s) => s.id === id) ?? null;
}
