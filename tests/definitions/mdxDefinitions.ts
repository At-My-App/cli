import {
    AmaCollectionDef,
    AmaComponentDef,
    AmaMdxConfigDef,
    AmaMdxFieldDef,
} from "@atmyapp/core";

type Callout = AmaComponentDef<
    "Callout",
    {
        title: string;
        count: number;
        isActive: boolean;
        items: string[];
        metadata: object;
    }
>;

type BlogMdxConfig = AmaMdxConfigDef<"blogComponents", [Callout]>;

type BlogRow = {
    title: string;
    content: AmaMdxFieldDef<BlogMdxConfig>;
    sections: AmaMdxFieldDef<BlogMdxConfig>[];
};

export type BlogCollection = AmaCollectionDef<"blog", BlogRow>;

export type ATMYAPP = [BlogCollection];
