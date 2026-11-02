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
    };
    Views: Record<string, never>;
    Functions: {
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
