import { Mail, Smartphone } from "lucide-react";
import { SiDiscord, SiSlack } from "@icons-pack/react-simple-icons";

export interface ChannelConfigItem {
  icon: typeof Mail;
  title: string;
  description: string;
  disabled?: boolean;
}

export const CHANNEL_CONFIG: Record<string, ChannelConfigItem> = {
  email: {
    icon: Mail,
    title: "E-mail",
    description: "Wysyłaj powiadomienia na adres e-mail",
  },
  discord: {
    icon: SiDiscord,
    title: "Discord",
    description: "Wysyłaj powiadomienia na kanał Discord przez webhook",
  },
  slack: {
    icon: SiSlack,
    title: "Slack",
    description: "Wysyłaj powiadomienia na kanał Slack",
  },
  sms: {
    icon: Smartphone,
    title: "SMS",
    description: "Wysyłaj powiadomienia SMS",
  },
};
