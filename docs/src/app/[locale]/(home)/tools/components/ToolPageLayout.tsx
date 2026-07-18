import { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { GridCrosses } from "@/components/GridCrosses";
import { RelatedTools } from "@/components/RelatedTools";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BuiltByRybbit } from "./BuiltByRybbit";
import { ToolCTA } from "./ToolCTA";

export interface FAQItem {
  question: string;
  answer: ReactNode;
}

export interface ToolPageLayoutProps {
  // Required sections
  toolSlug: string;
  title: string;
  description: string;
  badge?: string; // e.g., "AI-Powered Tool", "Free Tool"
  toolComponent: ReactNode;
  educationalContent: ReactNode;
  faqs: FAQItem[];
  relatedToolsCategory: "seo" | "analytics" | "privacy" | "social-media";

  // CTA section
  ctaTitle: string;
  ctaDescription: string;
  ctaEventLocation: string;
  ctaButtonText?: string;

  // Optional metadata for structured data (passed through)
  structuredData?: object;
}

export function ToolPageLayout({
  toolSlug,
  title,
  description,
  badge = "Free Tool",
  toolComponent,
  educationalContent,
  faqs,
  relatedToolsCategory,
  ctaTitle,
  ctaDescription,
  ctaEventLocation,
  ctaButtonText,
  structuredData,
}: ToolPageLayoutProps) {
  return (
    <div className="overflow-x-clip">
      {structuredData && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      )}

      {/* 1. Header — on the rail, matching the marketing interior pages */}
      <section className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="relative mx-auto max-w-[1200px] border-x border-neutral-200 dark:border-neutral-800 lg:grid lg:grid-cols-12">
          <GridCrosses />
          <div className="border-b border-neutral-200 px-5 pb-10 pt-8 dark:border-neutral-800 sm:px-8 lg:col-span-8 lg:border-b-0 lg:border-r lg:px-10 lg:pb-16 lg:pt-10">
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                <li>
                  <Link
                    href="/"
                    className="rounded-sm transition-colors hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:hover:text-white"
                  >
                    Home
                  </Link>
                </li>
                <ChevronRight className="size-3.5 text-neutral-400 dark:text-neutral-600" aria-hidden="true" />
                <li>
                  <Link
                    href="/tools"
                    className="rounded-sm transition-colors hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:hover:text-white"
                  >
                    Tools
                  </Link>
                </li>
                <ChevronRight className="size-3.5 text-neutral-400 dark:text-neutral-600" aria-hidden="true" />
                <li aria-current="page" className="font-medium text-neutral-950 dark:text-neutral-50">
                  {title}
                </li>
              </ol>
            </nav>

            <p className="mt-8 flex items-center gap-2.5 text-sm font-semibold tracking-tight text-emerald-700 dark:text-emerald-400">
              <span
                aria-hidden="true"
                className="size-2 rounded-[1px] bg-emerald-600 [animation:kicker-pulse_3.2s_ease-in-out_infinite] dark:bg-emerald-400 motion-reduce:animate-none"
              />
              {badge}
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-neutral-950 text-balance dark:text-neutral-50 md:text-5xl">
              {title}
            </h1>
          </div>

          <div className="flex items-end px-5 py-10 sm:px-8 lg:col-span-4 lg:px-10 lg:py-16">
            <p className="max-w-md text-base leading-7 text-neutral-600 text-pretty dark:text-neutral-400">
              {description}
            </p>
          </div>
        </div>
      </section>

      {/* 2–5. Tool, article, FAQ, related — a readable column on the rail */}
      <section className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="relative mx-auto max-w-[1200px] border-x border-neutral-200 dark:border-neutral-800">
          <GridCrosses />
          <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 md:py-16 lg:px-10">
            {/* 2. The Actual Tool */}
            <div>{toolComponent}</div>

            {/* 3. Educational Content */}
            <div className="mt-16 prose prose-neutral max-w-none dark:prose-invert prose-headings:tracking-tight prose-a:text-emerald-700 dark:prose-a:text-emerald-400">
              {educationalContent}
            </div>

            {/* 4. FAQ Section */}
            {faqs.length > 0 && (
              <div className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
                  Frequently asked questions
                </h2>
                <div className="mt-6 border-t border-neutral-200 dark:border-neutral-800">
                  <Accordion type="single" collapsible className="w-full">
                    {faqs.map((faq, index) => (
                      <AccordionItem
                        key={index}
                        value={`item-${index}`}
                        className="border-b border-neutral-200 px-0 dark:border-neutral-800"
                      >
                        <AccordionTrigger className="px-0 text-left">{faq.question}</AccordionTrigger>
                        <AccordionContent className="px-0">{faq.answer}</AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </div>
            )}

            {/* 5. Related Tools */}
            <RelatedTools currentToolHref={`/tools/${toolSlug}`} category={relatedToolsCategory} />

            <BuiltByRybbit />
          </div>
        </div>
      </section>

      {/* 6. CTA */}
      <ToolCTA
        title={ctaTitle}
        description={ctaDescription}
        eventLocation={ctaEventLocation}
        buttonText={ctaButtonText}
      />
    </div>
  );
}
