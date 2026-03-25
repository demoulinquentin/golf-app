import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "~/stores/authStore";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Trophy, Users, DollarSign, Target, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/templates/")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const { user, authToken } = useAuthStore();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const templatesQuery = useQuery(trpc.getGameTemplates.queryOptions());

  const categories = [
    { id: "all", name: "All Templates", icon: Target },
    { id: "popular", name: "Popular", icon: Trophy },
    { id: "team", name: "Team Games", icon: Users },
    { id: "betting", name: "Betting", icon: DollarSign },
  ];

  const filteredTemplates = templatesQuery.data?.filter(
    (t) => selectedCategory === "all" || t.category === selectedCategory
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-100">
      {/* Navigation */}
      <nav className="border-b border-green-200/50 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link to="/" className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-600 to-emerald-600 text-white">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-xl font-bold text-gray-900">GolfScore Pro</span>
              </Link>
            </div>
            <div className="flex items-center space-x-6">
              {user && (
                <>
                  <Link to="/" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Home
                  </Link>
                  <div className="flex items-center space-x-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center text-white text-sm font-semibold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{user.name}</span>
                  </div>
                </>
              )}
              {!user && (
                <>
                  <Link to="/auth/login" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Sign In
                  </Link>
                  <Link
                    to="/auth/signup"
                    className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:from-green-700 hover:to-emerald-700"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <Link to="/" className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900">Game Templates</h1>
          <p className="mt-2 text-lg text-gray-600">
            Choose a pre-configured game format or create your own custom rules
          </p>
        </div>

        {/* Category Filter */}
        <div className="mb-8 flex flex-wrap gap-3">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`flex items-center space-x-2 rounded-xl px-6 py-3 font-medium transition-all ${
                  selectedCategory === category.id
                    ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg"
                    : "bg-white text-gray-700 shadow hover:shadow-md"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{category.name}</span>
              </button>
            );
          })}
        </div>

        {/* Templates Grid */}
        {templatesQuery.isLoading && (
          <div className="text-center py-12">
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-green-600 border-t-transparent"></div>
            <p className="mt-4 text-gray-600">Loading templates...</p>
          </div>
        )}

        {templatesQuery.isError && (
          <div className="rounded-2xl bg-red-50 p-8 text-center">
            <p className="text-red-600">Failed to load templates. Please try again.</p>
          </div>
        )}

        {filteredTemplates && filteredTemplates.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="group overflow-hidden rounded-2xl bg-white shadow-lg transition-all hover:shadow-2xl"
              >
                {/* Template Image */}
                <div className="relative h-48 overflow-hidden bg-gradient-to-br from-green-100 to-emerald-100">
                  {template.imageUrl && (
                    <img
                      src={template.imageUrl}
                      alt={template.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-110"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                  <div className="absolute bottom-4 left-4">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-900 backdrop-blur-sm">
                      {template.category}
                    </span>
                  </div>
                </div>

                {/* Template Info */}
                <div className="p-6">
                  <h3 className="mb-2 text-xl font-bold text-gray-900">{template.name}</h3>
                  <p className="mb-4 text-sm text-gray-600">{template.description}</p>

                  <button
                    onClick={() => {
                      if (!authToken) {
                        void navigate({ to: "/auth/signup" });
                      } else {
                        void navigate({ to: "/round/new", search: { templateId: template.id } });
                      }
                    }}
                    className="w-full rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 py-2 font-semibold text-white transition-all hover:from-green-700 hover:to-emerald-700"
                  >
                    Use Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredTemplates && filteredTemplates.length === 0 && (
          <div className="rounded-2xl bg-white p-12 text-center shadow-xl">
            <p className="text-gray-600">No templates found in this category.</p>
          </div>
        )}

        {/* Custom Template CTA */}
        <div className="mt-12 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-600 p-8 text-center shadow-xl">
          <h2 className="mb-2 text-2xl font-bold text-white">Want to create your own format?</h2>
          <p className="mb-6 text-green-50">
            Use our advanced rule builder to configure any game format imaginable
          </p>
          <button
            onClick={() => {
              if (!authToken) {
                void navigate({ to: "/auth/signup" });
              } else {
                void navigate({ to: "/round/new" });
              }
            }}
            className="rounded-lg bg-white px-8 py-3 font-semibold text-green-600 shadow-lg transition-all hover:bg-gray-50"
          >
            Create Custom Game
          </button>
        </div>
      </div>
    </div>
  );
}
