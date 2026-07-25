export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  readonly __InternalSupabase: {
    readonly PostgrestVersion: "14.5";
  };
  readonly public: {
    readonly Tables: {
      readonly catalog_sync_runs: {
        readonly Row: {
          readonly completed_at: string | null;
          readonly created_at: string;
          readonly id: string;
          readonly notes: string | null;
          readonly products_accepted: number;
          readonly products_rejected: number;
          readonly products_seen: number;
          readonly provider: string;
          readonly started_at: string;
          readonly status: string;
        };
        readonly Insert: {
          readonly completed_at?: string | null;
          readonly created_at?: string;
          readonly id?: string;
          readonly notes?: string | null;
          readonly products_accepted?: number;
          readonly products_rejected?: number;
          readonly products_seen?: number;
          readonly provider?: string;
          readonly started_at?: string;
          readonly status: string;
        };
        readonly Update: {
          readonly completed_at?: string | null;
          readonly created_at?: string;
          readonly id?: string;
          readonly notes?: string | null;
          readonly products_accepted?: number;
          readonly products_rejected?: number;
          readonly products_seen?: number;
          readonly provider?: string;
          readonly started_at?: string;
          readonly status?: string;
        };
        readonly Relationships: [];
      };
      readonly product_images: {
        readonly Row: {
          readonly alt_text: string;
          readonly attribution: string;
          readonly created_at: string;
          readonly fetched_at: string;
          readonly height_px: number | null;
          readonly id: string;
          readonly is_primary: boolean;
          readonly mime_type: string;
          readonly product_id: string;
          readonly public_url: string;
          readonly sha256: string | null;
          readonly source_url: string;
          readonly storage_path: string;
          readonly width_px: number | null;
        };
        readonly Insert: {
          readonly alt_text: string;
          readonly attribution: string;
          readonly created_at?: string;
          readonly fetched_at?: string;
          readonly height_px?: number | null;
          readonly id?: string;
          readonly is_primary?: boolean;
          readonly mime_type: string;
          readonly product_id: string;
          readonly public_url: string;
          readonly sha256?: string | null;
          readonly source_url: string;
          readonly storage_path: string;
          readonly width_px?: number | null;
        };
        readonly Update: {
          readonly alt_text?: string;
          readonly attribution?: string;
          readonly created_at?: string;
          readonly fetched_at?: string;
          readonly height_px?: number | null;
          readonly id?: string;
          readonly is_primary?: boolean;
          readonly mime_type?: string;
          readonly product_id?: string;
          readonly public_url?: string;
          readonly sha256?: string | null;
          readonly source_url?: string;
          readonly storage_path?: string;
          readonly width_px?: number | null;
        };
        readonly Relationships: [
          {
            readonly foreignKeyName: "product_images_product_id_fkey";
            readonly columns: ["product_id"];
            readonly isOneToOne: false;
            readonly referencedRelation: "products";
            readonly referencedColumns: ["id"];
          },
        ];
      };
      readonly product_models: {
        readonly Row: {
          readonly created_at: string;
          readonly glb_path: string;
          readonly native_depth_mm: number;
          readonly native_height_mm: number;
          readonly native_width_mm: number;
          readonly product_id: string;
          readonly scale_verified: boolean;
          readonly updated_at: string;
          readonly usdz_path: string | null;
        };
        readonly Insert: {
          readonly created_at?: string;
          readonly glb_path: string;
          readonly native_depth_mm: number;
          readonly native_height_mm: number;
          readonly native_width_mm: number;
          readonly product_id: string;
          readonly scale_verified: boolean;
          readonly updated_at?: string;
          readonly usdz_path?: string | null;
        };
        readonly Update: {
          readonly created_at?: string;
          readonly glb_path?: string;
          readonly native_depth_mm?: number;
          readonly native_height_mm?: number;
          readonly native_width_mm?: number;
          readonly product_id?: string;
          readonly scale_verified?: boolean;
          readonly updated_at?: string;
          readonly usdz_path?: string | null;
        };
        readonly Relationships: [
          {
            readonly foreignKeyName: "product_models_product_id_fkey";
            readonly columns: ["product_id"];
            readonly isOneToOne: true;
            readonly referencedRelation: "products";
            readonly referencedColumns: ["id"];
          },
        ];
      };
      readonly products: {
        readonly Row: {
          readonly category: string;
          readonly colors: string[];
          readonly created_at: string;
          readonly currency: string;
          readonly depth_mm: number;
          readonly external_id: string;
          readonly first_seen_at: string;
          readonly height_mm: number;
          readonly id: string;
          readonly is_active: boolean;
          readonly keywords: string[];
          readonly last_seen_at: string;
          readonly last_sync_run_id: string | null;
          readonly materials: string[];
          readonly name: string;
          readonly price_usd: number;
          readonly product_url: string;
          readonly retailer_id: string;
          readonly source_payload: Json;
          readonly source_updated_at: string | null;
          readonly styles: string[];
          readonly updated_at: string;
          readonly variant_label: string | null;
          readonly variant_options: Json;
          readonly verification_source_url: string;
          readonly verified_at: string;
          readonly width_mm: number;
        };
        readonly Insert: {
          readonly category: string;
          readonly colors?: string[];
          readonly created_at?: string;
          readonly currency?: string;
          readonly depth_mm: number;
          readonly external_id: string;
          readonly first_seen_at?: string;
          readonly height_mm: number;
          readonly id: string;
          readonly is_active?: boolean;
          readonly keywords?: string[];
          readonly last_seen_at?: string;
          readonly last_sync_run_id?: string | null;
          readonly materials?: string[];
          readonly name: string;
          readonly price_usd: number;
          readonly product_url: string;
          readonly retailer_id: string;
          readonly source_payload?: Json;
          readonly source_updated_at?: string | null;
          readonly styles?: string[];
          readonly updated_at?: string;
          readonly variant_label?: string | null;
          readonly variant_options?: Json;
          readonly verification_source_url: string;
          readonly verified_at: string;
          readonly width_mm: number;
        };
        readonly Update: {
          readonly category?: string;
          readonly colors?: string[];
          readonly created_at?: string;
          readonly currency?: string;
          readonly depth_mm?: number;
          readonly external_id?: string;
          readonly first_seen_at?: string;
          readonly height_mm?: number;
          readonly id?: string;
          readonly is_active?: boolean;
          readonly keywords?: string[];
          readonly last_seen_at?: string;
          readonly last_sync_run_id?: string | null;
          readonly materials?: string[];
          readonly name?: string;
          readonly price_usd?: number;
          readonly product_url?: string;
          readonly retailer_id?: string;
          readonly source_payload?: Json;
          readonly source_updated_at?: string | null;
          readonly styles?: string[];
          readonly updated_at?: string;
          readonly variant_label?: string | null;
          readonly variant_options?: Json;
          readonly verification_source_url?: string;
          readonly verified_at?: string;
          readonly width_mm?: number;
        };
        readonly Relationships: [
          {
            readonly foreignKeyName: "products_last_sync_run_id_fkey";
            readonly columns: ["last_sync_run_id"];
            readonly isOneToOne: false;
            readonly referencedRelation: "catalog_sync_runs";
            readonly referencedColumns: ["id"];
          },
          {
            readonly foreignKeyName: "products_retailer_id_fkey";
            readonly columns: ["retailer_id"];
            readonly isOneToOne: false;
            readonly referencedRelation: "retailers";
            readonly referencedColumns: ["id"];
          },
        ];
      };
      readonly retailers: {
        readonly Row: {
          readonly base_url: string;
          readonly created_at: string;
          readonly display_name: string;
          readonly id: string;
          readonly updated_at: string;
        };
        readonly Insert: {
          readonly base_url: string;
          readonly created_at?: string;
          readonly display_name: string;
          readonly id: string;
          readonly updated_at?: string;
        };
        readonly Update: {
          readonly base_url?: string;
          readonly created_at?: string;
          readonly display_name?: string;
          readonly id?: string;
          readonly updated_at?: string;
        };
        readonly Relationships: [];
      };
    };
    readonly Views: {
      readonly catalog_products: {
        readonly Row: {
          readonly category: string | null;
          readonly colors: string[] | null;
          readonly currency: string | null;
          readonly depth_mm: number | null;
          readonly external_id: string | null;
          readonly glb_path: string | null;
          readonly height_mm: number | null;
          readonly id: string | null;
          readonly image_attribution: string | null;
          readonly image_source_url: string | null;
          readonly image_url: string | null;
          readonly keywords: string[] | null;
          readonly last_seen_at: string | null;
          readonly materials: string[] | null;
          readonly name: string | null;
          readonly native_depth_mm: number | null;
          readonly native_height_mm: number | null;
          readonly native_width_mm: number | null;
          readonly price_usd: number | null;
          readonly product_url: string | null;
          readonly retailer: string | null;
          readonly scale_verified: boolean | null;
          readonly source_updated_at: string | null;
          readonly styles: string[] | null;
          readonly usdz_path: string | null;
          readonly variant_label: string | null;
          readonly variant_options: Json | null;
          readonly verification_source_url: string | null;
          readonly verified_at: string | null;
          readonly width_mm: number | null;
        };
        readonly Relationships: [];
      };
    };
    readonly Functions: Record<never, never>;
    readonly Enums: Record<never, never>;
    readonly CompositeTypes: Record<never, never>;
  };
}

export type Tables<
  Name extends keyof (Database["public"]["Tables"] & Database["public"]["Views"]),
> = (Database["public"]["Tables"] & Database["public"]["Views"])[Name]["Row"];

export type TablesInsert<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Insert"];

export type TablesUpdate<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Update"];
