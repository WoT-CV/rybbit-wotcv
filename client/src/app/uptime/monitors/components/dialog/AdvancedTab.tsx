import React from "react";
import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { CreateMonitorFormData, UpdateMonitorFormData } from "../monitorSchemas";
import { useExtracted } from "next-intl";

interface AdvancedTabProps {
  form: UseFormReturn<CreateMonitorFormData | UpdateMonitorFormData>;
  monitorType: "http" | "tcp";
}

export function AdvancedTab({ form, monitorType }: AdvancedTabProps) {
  const t = useExtracted();

  return (
    <div className="space-y-4">
      {/* Monitor Name */}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("Monitor Name")}</FormLabel>
            <FormControl>
              <Input placeholder="My API Endpoint" {...field} value={field.value || ""} />
            </FormControl>
            <FormDescription>
              {t("A friendly name for this monitor. If not specified, the URL or host will be used.")}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {monitorType === "tcp" ? (
        <div className="text-sm text-neutral-500 mt-4">{t("No additional advanced options available for TCP monitors.")}</div>
      ) : (
        <>
          <FormField
            control={form.control}
            name="httpConfig.userAgent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("User Agent")}</FormLabel>
                <FormControl>
                  <Input placeholder="Custom User Agent" {...field} value={field.value || ""} />
                </FormControl>
                <FormDescription>{t("Override the default user agent string")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="httpConfig.headers"
            render={({ field }) => {
              // Use local state to manage headers array
              const [localHeaders, setLocalHeaders] = React.useState<Array<{ key: string; value: string; id: string }>>(
                () => {
                  if (!field.value) return [];
                  return Object.entries(field.value).map(([key, value], index) => ({
                    key,
                    value: value as string,
                    id: `header_${index}_${Date.now()}`,
                  }));
                }
              );

              // Sync local state changes back to form field
              React.useEffect(() => {
                const headersObject = localHeaders
                  .filter(h => h.key !== "") // Only include headers with keys
                  .reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {});

                field.onChange(Object.keys(headersObject).length > 0 ? headersObject : undefined);
              }, [localHeaders, field]);

              const updateHeader = (id: string, type: "key" | "value", newValue: string) => {
                setLocalHeaders(prev =>
                  prev.map(header => (header.id === id ? { ...header, [type]: newValue } : header))
                );
              };

              const removeHeader = (id: string) => {
                setLocalHeaders(prev => prev.filter(header => header.id !== id));
              };

              const addHeader = () => {
                setLocalHeaders(prev => [
                  ...prev,
                  {
                    key: "",
                    value: "",
                    id: `header_${Date.now()}`,
                  },
                ]);
              };

              return (
                <FormItem>
                  <div className="flex items-center justify-between mb-2">
                    <FormLabel>{t("Custom Headers")}</FormLabel>
                    <Button type="button" variant="outline" size="sm" onClick={addHeader} className="h-8">
                      <Plus className="h-4 w-4 mr-1" />
                      {t("Add header")}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {localHeaders.map(header => (
                      <div key={header.id} className="flex gap-2 items-center">
                        <Input
                          placeholder={t("Header name")}
                          value={header.key}
                          onChange={e => updateHeader(header.id, "key", e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          placeholder={t("Header value")}
                          value={header.value}
                          onChange={e => updateHeader(header.id, "value", e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeHeader(header.id)}
                          className="px-2"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {localHeaders.length === 0 && (
                      <div className="text-sm text-neutral-500">{t("No custom headers added")}</div>
                    )}
                  </div>
                  <FormDescription>{t("Additional headers to send with requests")}</FormDescription>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <FormField
            control={form.control}
            name="httpConfig.body"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Request Body")}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder='{"key": "value"}'
                    {...field}
                    value={field.value || ""}
                    className="font-mono min-h-[100px]"
                    style={{ fontSize: "12px" }}
                  />
                </FormControl>
                <FormDescription>{t("Request body for POST, PUT, PATCH methods. Usually JSON or form data.")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="httpConfig.followRedirects"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between">
                <div className="space-y-0.5">
                  <FormLabel>{t("Follow Redirects")}</FormLabel>
                  <FormDescription>{t("Automatically follow HTTP redirects")}</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="httpConfig.ipVersion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("IP Version")}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="any">{t("Any")}</SelectItem>
                    <SelectItem value="ipv4">{t("IPv4 Only")}</SelectItem>
                    <SelectItem value="ipv6">{t("IPv6 Only")}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </div>
  );
}
