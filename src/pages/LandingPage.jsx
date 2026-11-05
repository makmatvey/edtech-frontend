import LandingHeader from "../components/LandingHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";

const featureCards = [
  {
    iconId: "documentation-icon",
    title: "Feature title",
    description: "Short description for this feature card.",
  },
  {
    iconId: "social-icon",
    title: "Feature title",
    description: "Short description for this feature card.",
  },
  {
    iconId: "documentation-icon",
    title: "Feature title",
    description: "Short description for this feature card.",
  },
];

const steps = [
  { step: "1", title: "Step title", description: "Brief explanation of this step." },
  { step: "2", title: "Step title", description: "Brief explanation of this step." },
  { step: "3", title: "Step title", description: "Brief explanation of this step." },
];

function SpriteIcon({ id, className = "w-8 h-8" }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`/icons.svg#${id}`} />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <LandingHeader />

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
          <p className="text-sm font-medium text-[#aa3bff] mb-3">Hero label</p>
          <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 tracking-tight max-w-3xl mx-auto">
            Main headline placeholder
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Supporting text goes here. Replace with your product pitch when ready.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button href="#features">Primary action</Button>
            <Button variant="secondary" href="#how-it-works">
              Secondary action
            </Button>
          </div>
        </section>

        <section
          id="features"
          className="border-t border-gray-200 bg-white py-16 sm:py-20 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900">
                Section heading
              </h2>
              <p className="mt-2 text-gray-600">
                Optional intro text for the features block.
              </p>
            </div>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
              {featureCards.map((item, index) => (
                <li key={index}>
                  <Card className="h-full">
                    <SpriteIcon id={item.iconId} className="w-9 h-9 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                    <p className="mt-2 text-gray-600 text-sm leading-relaxed">
                      {item.description}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="how-it-works"
          className="py-16 sm:py-20 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900">
                How it works
              </h2>
              <p className="mt-2 text-gray-600">
                Short overview of the process in three steps.
              </p>
            </div>
            <ol className="grid gap-8 md:grid-cols-3 list-none p-0 m-0">
              {steps.map((item) => (
                <li key={item.step} className="text-center md:text-left">
                  <div
                    className="mx-auto md:mx-0 w-10 h-10 rounded-full bg-[#aa3bff]/10 text-[#aa3bff] font-semibold flex items-center justify-center mb-4"
                    aria-hidden="true"
                  >
                    {item.step}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-gray-600 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="login" className="scroll-mt-16 py-12 sm:py-16 border-t border-gray-200">
          <div className="max-w-6xl mx-auto px-4">
            <Card className="text-center max-w-xl mx-auto">
              <h2 className="text-xl font-semibold text-gray-900">Call to action</h2>
              <p className="mt-2 text-gray-600 text-sm">
                Placeholder for sign-up or login prompt.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button href="#login">Get started</Button>
                <Button variant="link" href="#login">
                  Log in
                </Button>
              </div>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-gray-900">EdTech Hack</p>
            <p className="mt-1 text-sm text-gray-500">Footer tagline placeholder.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Footer">
            <a href="#features" className="text-gray-600 hover:text-gray-900">
              Features
            </a>
            <a href="#how-it-works" className="text-gray-600 hover:text-gray-900">
              How it works
            </a>
            <a href="#login" className="text-gray-600 hover:text-gray-900">
              Log in
            </a>
            <Button variant="link" to="/dashboard" className="text-sm">
              Dashboard
            </Button>
          </nav>
        </div>
        <div className="border-t border-gray-100 py-4 text-center text-xs text-gray-400">
          © Placeholder year. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
