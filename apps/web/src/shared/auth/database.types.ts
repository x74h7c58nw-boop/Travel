export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      photos: {
        Row: {
          id: string;
          group_id: string;
          uploaded_by: string;
          storage_path: string;
          original_name: string;
          content_type: string;
          byte_size: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          uploaded_by: string;
          storage_path: string;
          original_name: string;
          content_type: string;
          byte_size: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["photos"]["Insert"]>;
        Relationships: [];
      };
      albums: {
        Row: {
          id: string;
          group_id: string;
          created_by: string;
          title: string;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          created_by: string;
          title: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["albums"]["Insert"]>;
        Relationships: [];
      };
      album_photos: {
        Row: {
          album_id: string;
          photo_id: string;
          position: number;
        };
        Insert: {
          album_id: string;
          photo_id: string;
          position: number;
        };
        Update: Partial<Database["public"]["Tables"]["album_photos"]["Insert"]>;
        Relationships: [];
      };
      group_members: {
        Row: {
          group_id: string;
          user_id: string;
        };
        Insert: {
          group_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["group_members"]["Insert"]>;
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          destination: string;
          start_date: string | null;
          end_date: string | null;
          version: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          destination?: string;
          start_date?: string | null;
          end_date?: string | null;
          version?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["groups"]["Insert"]>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          group_id: string;
          created_by: string;
          paid_by: string;
          title: string;
          amount: number;
          spent_on: string;
          version: number;
        };
        Insert: {
          id?: string;
          group_id: string;
          created_by: string;
          paid_by: string;
          title: string;
          amount: number;
          spent_on: string;
          version?: number;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Insert"]>;
        Relationships: [];
      };
      expense_shares: {
        Row: {
          expense_id: string;
          user_id: string;
          amount: number;
        };
        Insert: {
          expense_id: string;
          user_id: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["expense_shares"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_travel_group: {
        Args: { p_name: string };
        Returns: string;
      };
      get_group_invite: {
        Args: { p_group_id: string };
        Returns: string;
      };
      join_travel_group: {
        Args: { p_code: string };
        Returns: string;
      };
      update_travel_group: {
        Args: {
          p_group_id: string;
          p_version: number;
          p_destination: string;
          p_start: string | null;
          p_end: string | null;
        };
        Returns: undefined;
      };
      save_travel_expense: {
        Args: {
          p_group_id: string;
          p_title: string;
          p_amount: number;
          p_paid_by: string;
          p_spent_on: string;
          p_participants: string[];
          p_expense_id?: string | null;
          p_version?: number | null;
        };
        Returns: string;
      };
      delete_travel_expense: {
        Args: { p_expense_id: string; p_version: number };
        Returns: undefined;
      };
      get_group_snapshot: {
        Args: { p_group_id: string };
        Returns: {
          group: Database["public"]["Tables"]["groups"]["Row"];
          members: Database["public"]["Tables"]["group_members"]["Row"][];
          expenses: Database["public"]["Tables"]["expenses"]["Row"][];
          shares: Database["public"]["Tables"]["expense_shares"]["Row"][];
        } | null;
      };
      create_album: {
        Args: {
          p_group_id: string;
          p_title: string;
          p_description: string;
          p_photo_ids: string[];
        };
        Returns: Database["public"]["Tables"]["albums"]["Row"];
      };
      update_album: {
        Args: {
          p_album_id: string;
          p_expected_updated_at: string;
          p_title: string;
          p_description: string;
          p_photo_ids: string[];
        };
        Returns: Database["public"]["Tables"]["albums"]["Row"];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
