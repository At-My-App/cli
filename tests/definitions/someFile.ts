import { AmaContentDef } from "@atmyapp/core";

type HeroContentData = {
  title: string;
  description: string;
};

export type HeroContent = AmaContentDef<"hero.json", HeroContentData>;

export type ATMYAPP = [HeroContent];
