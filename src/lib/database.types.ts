export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          subscription_tier: "free" | "pro";
          stripe_customer_id: string | null;
          alert_email_enabled: boolean;
          slack_webhook_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          subscription_tier?: "free" | "pro";
          stripe_customer_id?: string | null;
          alert_email_enabled?: boolean;
          slack_webhook_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          subscription_tier?: "free" | "pro";
          stripe_customer_id?: string | null;
          alert_email_enabled?: boolean;
          slack_webhook_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          deployed_url: string;
          github_repo_url: string | null;
          platform: string | null;
          weekly_rescan_enabled: boolean;
          last_auto_scan_at: string | null;
          next_auto_scan_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          deployed_url: string;
          github_repo_url?: string | null;
          platform?: string | null;
          weekly_rescan_enabled?: boolean;
          last_auto_scan_at?: string | null;
          next_auto_scan_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          deployed_url?: string;
          github_repo_url?: string | null;
          platform?: string | null;
          weekly_rescan_enabled?: boolean;
          last_auto_scan_at?: string | null;
          next_auto_scan_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      scans: {
        Row: {
          id: string;
          project_id: string;
          status: "queued" | "running" | "complete" | "failed";
          started_at: string | null;
          completed_at: string | null;
          overall_verdict: "at_risk" | "secure" | null;
          is_preview: boolean;
          error_message: string | null;
          trigger: "manual" | "scheduled";
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          status?: "queued" | "running" | "complete" | "failed";
          started_at?: string | null;
          completed_at?: string | null;
          overall_verdict?: "at_risk" | "secure" | null;
          is_preview?: boolean;
          error_message?: string | null;
          trigger?: "manual" | "scheduled";
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          status?: "queued" | "running" | "complete" | "failed";
          started_at?: string | null;
          completed_at?: string | null;
          overall_verdict?: "at_risk" | "secure" | null;
          is_preview?: boolean;
          error_message?: string | null;
          trigger?: "manual" | "scheduled";
          created_at?: string;
        };
        Relationships: [];
      };
      findings: {
        Row: {
          id: string;
          scan_id: string;
          check_id: string;
          severity: "critical" | "warning" | "info" | "pass";
          title: string;
          location: string | null;
          detail: string;
          evidence: string | null;
          fix_type: "code" | "prompt" | "manual" | null;
          fix_content: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          scan_id: string;
          check_id: string;
          severity: "critical" | "warning" | "info" | "pass";
          title: string;
          location?: string | null;
          detail: string;
          evidence?: string | null;
          fix_type?: "code" | "prompt" | "manual" | null;
          fix_content?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          scan_id?: string;
          check_id?: string;
          severity?: "critical" | "warning" | "info" | "pass";
          title?: string;
          location?: string | null;
          detail?: string;
          evidence?: string | null;
          fix_type?: "code" | "prompt" | "manual" | null;
          fix_content?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      preview_scans: {
        Row: {
          id: string;
          target_url: string;
          status: "queued" | "running" | "complete" | "failed";
          overall_verdict: "at_risk" | "secure" | null;
          findings: Json;
          error_message: string | null;
          client_ip: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          target_url: string;
          status?: "queued" | "running" | "complete" | "failed";
          overall_verdict?: "at_risk" | "secure" | null;
          findings?: Json;
          error_message?: string | null;
          client_ip?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          target_url?: string;
          status?: "queued" | "running" | "complete" | "failed";
          overall_verdict?: "at_risk" | "secure" | null;
          findings?: Json;
          error_message?: string | null;
          client_ip?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
