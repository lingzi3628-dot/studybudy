import { describe, it, expect } from "vitest";
import { parsePrismaModels } from "./prisma-erd";

const SCHEMA = `// Blog schema
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  posts     Post[]

  @@map("users")
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  body      String?
  rating    Float    @default(0)
  tags      String[]
  createdAt DateTime @default(now())
  userId    Int
  user      User     @relation(fields: [userId], references: [id])

  @@id([id])
}

model Tag {
  id    Int    @id
  label String
}`;

describe("parsePrismaModels", () => {
  const erd = parsePrismaModels(SCHEMA);

  it("extracts every model as a table", () => {
    expect(erd.tables.map((t) => t.name)).toEqual(["User", "Post", "Tag"]);
  });

  it("captures scalar columns with types", () => {
    const post = erd.tables.find((t) => t.name === "Post")!;
    const names = post.columns.map((c) => c.name);
    expect(names).toContain("title");
    expect(names).toContain("userId");
    expect(names).toContain("rating");
    expect(post.columns.find((c) => c.name === "tags")!.type).toBe("String[]");
  });

  it("marks @id fields as primary keys", () => {
    const post = erd.tables.find((t) => t.name === "Post")!;
    expect(post.columns.find((c) => c.name === "id")!.pk).toBe(true);
    expect(post.columns.find((c) => c.name === "title")!.pk).toBe(false);
  });

  it("supports composite @@id([field]) keys", () => {
    const post = erd.tables.find((t) => t.name === "Post")!;
    expect(post.columns.find((c) => c.name === "id")!.pk).toBe(true);
  });

  it("treats ? fields as nullable", () => {
    const post = erd.tables.find((t) => t.name === "Post")!;
    expect(post.columns.find((c) => c.name === "body")!.notNull).toBe(false);
    expect(post.columns.find((c) => c.name === "title")!.notNull).toBe(true);
  });

  it("derives FK relations from @relation(fields:, references:)", () => {
    expect(erd.relations).toContainEqual({
      from: "Post",
      fromColumn: "userId",
      to: "User",
      toColumn: "id",
    });
  });

  it("skips back-relation fields (they are not columns)", () => {
    const user = erd.tables.find((t) => t.name === "User")!;
    expect(user.columns.map((c) => c.name)).not.toContain("posts");
  });

  it("returns empty model for non-prisma input", () => {
    expect(parsePrismaModels("this is not a schema")).toEqual({ tables: [], relations: [] });
  });
});
