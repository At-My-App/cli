import { AmaContentDef } from "@atmyapp/core";

// Data types for different content
type HeroContentData = {
  title: string;
  subtitle: string;
  backgroundImage: string;
};

type AboutContentData = {
  content: string;
  author: string;
  publishedDate: string;
};

type ContactContentData = {
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    country: string;
  };
};

type ProductContentData = {
  name: string;
  price: number;
  description: string;
  images: string[];
  inStock: boolean;
};

// Content references
export type HeroContent = AmaContentDef<"pages/hero.json", HeroContentData>;
export type AboutContent = AmaContentDef<"pages/about.json", AboutContentData>;
export type ContactContent = AmaContentDef<
  "pages/contact.json",
  ContactContentData
>;
export type ProductContent = AmaContentDef<
  "products/featured.json",
  ProductContentData
>;

// Export all definitions for migration
export type ATMYAPP = [
  HeroContent,
  AboutContent,
  ContactContent,
  ProductContent,
];
