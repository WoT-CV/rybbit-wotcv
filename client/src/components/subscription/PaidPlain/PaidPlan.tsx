import { Clock, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { BACKEND_URL } from "../../../lib/const";
import { getPlanType, getStripePrices } from "../../../lib/stripe";
import { formatDate } from "../../../lib/subscription/planUtils";
import { useStripeSubscription } from "../../../lib/subscription/useStripeSubscription";
import { UsageChart } from "../../UsageChart";
import { authClient } from "@/lib/auth";
import { InvoicesCard } from "../components/InvoicesCard";
import { UsageCards } from "../components/UsageCards";
import { CancellationDialog } from "./CancellationDialog";
import { PlanDialog } from "../components/PlanDialog";

export function PaidPlan() {
  const { data: activeSubscription, isLoading, error: subscriptionError, refetch } = useStripeSubscription();

  const { data: activeOrg } = authClient.useActiveOrganization();
  const organizationId = activeOrg?.id;

  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [showCancellationDialog, setShowCancellationDialog] = useState(false);

  const isTrial = !!activeSubscription?.isTrial;
  const trialDaysRemaining = activeSubscription?.trialDaysRemaining || 0;

  const eventLimit = activeSubscription?.eventLimit || 0;
  const currentUsage = activeSubscription?.monthlyEventCount || 0;
  const isAnnualPlan = activeSubscription?.interval === "year";

  const stripePlan = getStripePrices().find(p => p.name === activeSubscription?.planName);

  const planType = activeSubscription ? getPlanType(activeSubscription.planName) : null;

  const currentPlanDetails = activeSubscription
    ? {
      id: planType,
      name: planType,
      price: `$${stripePlan?.price}`,
      interval: stripePlan?.interval,
    }
    : null;

  const createPortalSession = async (flowType?: string) => {
    if (!organizationId) {
      toast.error("Nie wybrano organizacji");
      return;
    }

    setActionError(null);
    setIsProcessing(true);
    try {
      const response = await fetch(`${BACKEND_URL}/stripe/create-portal-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          returnUrl: window.location.href,
          organizationId,
          flowType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nie udało się utworzyć sesji portalu płatności.");
      }

      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      } else {
        throw new Error("Nie otrzymano adresu URL portalu.");
      }
    } catch (err: any) {
      console.error("Portal Session Error:", err);
      setActionError(err.message || "Nie można otworzyć portalu płatności.");
      toast.error(`Błąd: ${err.message || "Nie można otworzyć portalu płatności."}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChangePlan = () => setShowPlanDialog(true);
  const handleCancelSubscription = () => setShowCancellationDialog(true);

  const getFormattedPrice = () => {
    if (!currentPlanDetails) return "$0/miesiąc";
    return `${currentPlanDetails.price}/${currentPlanDetails.interval === "year" ? "rok" : "miesiąc"}`;
  };

  const formatRenewalDate = () => {
    if (!activeSubscription?.currentPeriodEnd) return "N/A";
    const formattedDate = formatDate(activeSubscription.currentPeriodEnd);

    if (activeSubscription.cancelAtPeriodEnd) {
      return `Anuluje się ${formattedDate}`;
    }
    if (activeSubscription.status === "trialing") {
      return `Okres próbny kończy się ${formattedDate}`;
    }
    if (activeSubscription.status === "active") {
      return isAnnualPlan ? `Odnawia się rocznie ${formattedDate}` : `Odnawia się miesięcznie ${formattedDate}`;
    }
    return `Status: ${activeSubscription.status}, kończy się/odnawia ${formattedDate}`;
  };

  if (!activeSubscription) {
    return null;
  }

  return (
    <div className="space-y-6">
      {actionError && <Alert variant="destructive">{actionError}</Alert>}
      <PlanDialog
        open={showPlanDialog}
        onOpenChange={setShowPlanDialog}
        currentPlanName={activeSubscription?.planName}
        hasActiveSubscription={!!activeSubscription}
      />
      {activeSubscription && organizationId && (
        <CancellationDialog
          open={showCancellationDialog}
          onOpenChange={setShowCancellationDialog}
          subscription={activeSubscription}
          organizationId={organizationId}
          onProceedToStripe={() => createPortalSession("subscription_cancel")}
          onChangePlan={handleChangePlan}
        />
      )}
      <Card>
        <CardContent>
          <div className="space-y-6 mt-3 p-2">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-3xl font-bold">{currentPlanDetails?.name || activeSubscription.planName} </p>
                <p className="text text-neutral-600 dark:text-neutral-300">
                  {getFormattedPrice()} • {activeSubscription.eventLimit.toLocaleString()} zdarzeń
                </p>
                {isAnnualPlan && (
                  <div className="mt-2 text-sm text-emerald-400">
                    <p>Oszczędzasz dzięki płatności rocznej (4 miesiące gratis)</p>
                  </div>
                )}
                <p className="text-neutral-400 text-sm">{formatRenewalDate()}</p>
              </div>
              <div className="space-x-2">
                <Button
                  variant="outline"
                  onClick={() => createPortalSession("payment_method_update")}
                  disabled={isProcessing}
                >
                  Zarządzaj płatnością
                </Button>
                <Button variant="success" onClick={handleChangePlan}>
                  Zmień plan
                </Button>
              </div>
            </div>
            {currentUsage >= eventLimit && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    <strong>Limit użycia osiągnięty!</strong> Przekroczono limit zdarzeń w Twoim planie.
                  </p>
                  <Button variant="success" size="sm" onClick={handleChangePlan}>
                    Zwiększ plan
                  </Button>
                </div>
              </div>
            )}
            <UsageCards />

            {organizationId && <UsageChart organizationId={organizationId} />}

            {isTrial && (
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <Clock className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                <AlertTitle>Status okresu próbnego</AlertTitle>
                <AlertDescription>
                  {trialDaysRemaining > 0 ? (
                    <>Okres próbny kończy się za <strong>{trialDaysRemaining} dni</strong>, {formatDate(activeSubscription.currentPeriodEnd)}.</>
                  ) : (
                    <>Okres próbny kończy się dzisiaj. Zwiększ plan, aby kontynuować śledzenie.</>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {isAnnualPlan && !isTrial && (
              <div className="pt-2 pb-0 px-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-md border border-emerald-100 dark:border-emerald-800">
                <p className="text-sm text-emerald-700 dark:text-emerald-300 py-2">
                  <strong>Rozliczenie roczne:</strong> korzystasz z rozliczenia rocznego, które jest tańsze niż miesięczne.
                  Subskrypcja odnowi się raz w roku:{" "}
                  {formatDate(activeSubscription.currentPeriodEnd)}.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                variant="ghost"
                onClick={handleCancelSubscription}
                disabled={isProcessing}
                size="sm"
                className="dark:hover:bg-red-700/60"
              >
                {isTrial ? "Anuluj okres próbny" : "Anuluj subskrypcję"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <InvoicesCard />
    </div >
  );
}
