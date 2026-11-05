import LandingHeader from "../components/LandingHeader";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconBook,
  IconChart,
  IconUsers,
} from "../components/ui";
import { Link } from "react-router-dom";
import { cn } from "../components/ui/cn";

const featureCards = [
  {
    Icon: IconBook,
    title: "Feature title",
    description: "Short description for this feature card.",
  },
  {
    Icon: IconUsers,
    title: "Feature title",
    description: "Short description for this feature card.",
  },
  {
    Icon: IconChart,
    title: "Feature title",
    description: "Short description for this feature card.",
  },
];

const steps = [
  { step: "1", title: "Step title", description: "Brief explanation of this step." },
  { step: "2", title: "Step title", description: "Brief explanation of this step." },
  { step: "3", title: "Step title", description: "Brief explanation of this step." },
];

const anchorButtonPrimary = cn(
  "inline-flex items-center justify-center rounded-[var(--radius-ui)] font-medium transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500",
  "h-10 px-4 text-sm gap-2",
  "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
);

const anchorButtonSecondary = cn(
  "inline-flex items-center justify-center rounded-[var(--radius-ui)] font-medium transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500",
  "h-10 px-4 text-sm gap-2",
  "bg-white text-ink border border-border hover:bg-surface-muted",
);

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-muted flex flex-col">
      <LandingHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24 text-center">
          <Badge variant="brand" className="mb-4">
            Hero label
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-5xl max-w-3xl mx-auto">
            Main headline placeholder
          </h1>
          <p className="mt-4 text-base text-ink-muted max-w-2xl mx-auto sm:text-lg leading-relaxed">
            Supporting text goes here. Replace with your product pitch when ready.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="#features" className={anchorButtonPrimary}>
              Primary action
            </a>
            <a href="#how-it-works" className={anchorButtonSecondary}>
              Secondary action
            </a>
          </div>
        </section>

        <section
          id="features"
          className="border-t border-border bg-surface py-16 sm:py-20 scroll-mt-20"
        >
          <div className="mx-auto max-w-6xl px-4">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Section heading
              </h2>
              <p className="mt-2 text-ink-muted">
                Optional intro text for the features block.
              </p>
            </div>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
              {featureCards.map((item, index) => (
                <li key={index}>
                  <Card className="h-full">
                    <CardHeader>
                      <span className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                        <item.Icon className="size-5" />
                      </span>
                      <CardTitle>{item.title}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="py-16 sm:py-20 scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                How it works
              </h2>
              <p className="mt-2 text-ink-muted">
                Short overview of the process in three steps.
              </p>
            </div>
            <ol className="grid gap-8 md:grid-cols-3 list-none p-0 m-0">
              {steps.map((item) => (
                <li key={item.step} className="text-center md:text-left">
                  <div
                    className="mx-auto md:mx-0 mb-4 flex size-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800"
                    aria-hidden="true"
                  >
                    {item.step}
                  </div>
                  <h3 className="text-lg font-semibold text-ink">{item.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                    {item.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="login" className="scroll-mt-20 border-t border-border py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4">
            <Card className="mx-auto max-w-xl text-center">
              <CardHeader className="border-b-0 pb-0">
                <CardTitle>Call to action</CardTitle>
                <CardDescription>
                  Placeholder for sign-up or login prompt.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap justify-center gap-3 pt-2">
                <a href="#login" className={anchorButtonPrimary}>
                  Get started
                </a>
                <a
                  href="#login"
                  className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
                >
                  Log in
                </a>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-ink">EdTech Hack</p>
            <p className="mt-1 text-sm text-ink-muted">Footer tagline placeholder.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Footer">
            <a href="#features" className="text-ink-muted hover:text-ink">
              Features
            </a>
            <a href="#how-it-works" className="text-ink-muted hover:text-ink">
              How it works
            </a>
            <a href="#login" className="text-ink-muted hover:text-ink">
              Log in
            </a>
            <Link
              to="/dashboard"
              className="font-medium text-brand-700 hover:text-brand-800 hover:underline"
            >
              Dashboard
            </Link>
          </nav>
        </div>
        <div className="border-t border-border py-4 text-center text-xs text-ink-muted">
          © Placeholder year. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
