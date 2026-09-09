export interface ShopSettings {
  id?: number;
  name: string;
  logo_url: string | null;
  show_logo: boolean;
  show_name: boolean;
  phone: string | null;
  address: string | null;
  receipt_footer: string | null;
  currency: string;
}
