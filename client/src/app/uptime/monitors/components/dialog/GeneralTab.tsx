import React from "react";
import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { UptimeMonitor } from "@/api/uptime/monitors";
import { CreateMonitorFormData, UpdateMonitorFormData } from "../monitorSchemas";
import { useExtracted } from "next-intl";

interface GeneralTabProps {
  form: UseFormReturn<CreateMonitorFormData | UpdateMonitorFormData>;
  monitor?: UptimeMonitor;
  isEdit: boolean;
  monitorType: "http" | "tcp";
}

export const INTERVAL_OPTIONS = [
  { value: 30, label: "30 sekund" },
  { value: 60, label: "1 minuta" },
  { value: 120, label: "2 minuty" },
  { value: 180, label: "3 minuty" },
  { value: 300, label: "5 minut" },
  { value: 600, label: "10 minut" },
  { value: 1800, label: "30 minut" },
];

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"] as const;

export function getIntervalOptionLabel(seconds: number | undefined, t: ReturnType<typeof useExtracted>) {
  switch (seconds) {
    case 30:
      return t("30 sekund");
    case 60:
      return t("1 minuta");
    case 120:
      return t("2 minuty");
    case 180:
      return t("3 minuty");
    case 300:
      return t("5 minut");
    case 600:
      return t("10 minut");
    case 1800:
      return t("30 minut");
    default:
      return `${seconds}s`;
  }
}

export function GeneralTab({ form, monitor, isEdit, monitorType }: GeneralTabProps) {
  const t = useExtracted();

  return (
    <div className="space-y-4">
      {/* Monitor Type */}
      {!isEdit ? (
        <FormField
          control={form.control}
          name="monitorType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("Monitor Type")}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="http">{t("HTTP/HTTPS")}</SelectItem>
                  <SelectItem value="tcp">{t("TCP Port")}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <div className="space-y-1">
          <FormLabel>{t("Monitor Type")}</FormLabel>
          <div className="px-3 py-2 border border-neutral-800 rounded-md bg-neutral-900 text-neutral-400">
            {monitor?.monitorType === "http" ? t("HTTP/HTTPS") : t("TCP Port")}
          </div>
        </div>
      )}

      {/* HTTP Configuration */}
      {monitorType === "http" && (
        <>
          <FormField
            control={form.control}
            name="httpConfig.url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("URL")}</FormLabel>
                <FormControl>
                  <Input type="url" placeholder="https://api.example.com/health" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="httpConfig.method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("HTTP Method")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {HTTP_METHODS.map(method => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="httpConfig.timeoutMs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Timeout (ms)")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      value={field.value || ""}
                      onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </>
      )}

      {/* TCP Configuration */}
      {monitorType === "tcp" && (
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="tcpConfig.host"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Host")}</FormLabel>
                <FormControl>
                  <Input placeholder="example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tcpConfig.port"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Port")}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    value={field.value || ""}
                    onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Check Interval */}
      <FormField
        control={form.control}
        name="intervalSeconds"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("Check Interval")}</FormLabel>
            <Select
              onValueChange={value => field.onChange(parseInt(value))}
              value={field.value?.toString()}
              defaultValue={field.value?.toString()}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {INTERVAL_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {getIntervalOptionLabel(option.value, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Enabled Switch */}
      <FormField
        control={form.control}
        name="enabled"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <FormLabel>{t("Enable Monitor")}</FormLabel>
              <FormDescription>
                {isEdit
                  ? t("Monitor will run at the configured interval when enabled")
                  : t("Start monitoring immediately after creation")}
              </FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
}
