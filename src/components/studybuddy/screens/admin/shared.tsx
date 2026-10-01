"use client";
import React from "react";

export type Stats = {
  totalUsers: number;
  totalStudySets: number;
  totalCards: number;
  totalTopics: number;
  totalBooks: number;
  bannedUsers: number;
  proUsers: number;
  activeUsers: number;
  aiCallsToday: number;
  aiCallsSuccess: number;
  aiCallsError: number;
  totalCostToday: number;
};

export type AdminUser = {
  id: string; email: string | null; name: string | null; phoneNumber: string | null;
  plan: string; role: string;
  banned: boolean; createdAt: string; lastActive: string | null; grade: string | null;
  hasApiKey: boolean; _count: { studySets: number; attempts: number; aiCallLogs: number };
};

export type Provider = {
  id: string; name: string; providerType: string; enabled: boolean;
  baseUrl: string | null; model: string | null; maxTokens: number; costPer1kTokens: number;
  isDefault: boolean; priority: number; apiKeyMasked: string | null;
};

export type Book = { id: string; title: string; description: string | null; published: boolean; createdAt: string; _count?: { chapters: number } };
export type Chapter = { id: string; title: string | null; orderIndex: number; bookId: string; _count?: { topics: number }; book?: { title: string } };
export type AdminTopic = {
  id: string; subject: string; name: string; description: string | null;
  published: boolean; createdAt: string; _count?: { cards: number; lessons: number };
  chapter?: { id: string; title: string | null; book?: { title: string } } | null;
};
export type AiLog = {
  id: string; createdAt: string; status: string; providerType: string | null;
  model: string | null; totalTokens: number | null; cost: number;
  errorMessage: string | null; route: string | null;
  user?: { email: string | null; name: string | null } | null;
};
export type AdminActionLog = {
  id: string; createdAt: string; action: string; details: any;
  adminUser?: { email: string | null; name: string | null } | null;
};

export const Field = (props: any): any => {
  const { label, children } = props;
  return (
    <div>
      {label && <label className="text-xs font-semibold text-gray-500 mb-1 block">{label}</label>}
      {children}
    </div>
  );
}

export const ErrorBox = (props: any): any => {
  const error = props.error || props.message || null;
  if (!error) return null;
  return (
    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
      <span className="w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center text-white text-[10px] font-bold">!</span>
      {error}
    </div>
  );
}

export const Spinner = (): any => {
  return <span className="inline-block w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />;
}
