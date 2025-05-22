# 🚀 AtMyApp CLI

[![npm version](https://badge.fury.io/js/%40atmyapp%2Fcli.svg)](https://badge.fury.io/js/%40atmyapp%2Fcli)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

> 🔧 **Migrate your TypeScript definitions seamlessly.** The official CLI tool for AtMyApp - AI-powered content management that migrates your type definitions to the AtMyApp platform with zero configuration.

## 📖 Table of Contents

- [🌟 Features](#-features)
- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
- [📚 Commands](#-commands)
  - [use Command](#use-command)
  - [migrate Command](#migrate-command)
- [🎯 Type Definitions](#-type-definitions)
  - [Content Definitions](#content-definitions)
  - [Event Definitions](#event-definitions)
  - [Image & File Definitions](#image--file-definitions)
- [💡 Examples](#-examples)
- [🔧 Configuration](#-configuration)
- [🏗️ Architecture](#-architecture)
- [🧪 Testing](#-testing)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🌟 Features

✨ **Automated Type Migration** - Extracts TypeScript definitions and migrates them automatically  
📊 **Event Analytics Support** - Built-in support for event tracking definitions  
🖼️ **Media Type Support** - Handles image and file definitions with optimization configs  
🔄 **Real-time Processing** - Process multiple definition files simultaneously  
🎯 **Type-Safe** - Full TypeScript support with comprehensive validation  
⚡ **Zero Configuration** - Works out of the box with smart defaults  
🔐 **Secure** - API key authentication with session management  
🌊 **Pipeline Architecture** - Extensible processing pipeline for custom transformations

## 📦 Installation

```bash
# npm
npm install -g @atmyapp/cli

# yarn
yarn global add @atmyapp/cli

# pnpm
pnpm add -g @atmyapp/cli
```

## 🚀 Quick Start

```bash
# 1. Authenticate with your AtMyApp project
ama use --token your-api-token --url https://your-project.atmyapp.com

# 2. Migrate your definitions
ama migrate

# 3. Or run in dry-run mode to preview changes
ama migrate --dry-run --verbose
```

## 📚 Commands

### use Command

Authenticate and configure your AtMyApp project connection.

```bash
ama use [options]
```

**Options:**

- `-t, --token <token>` - Authentication token
- `-u, --url <url>` - Project base URL

**Interactive Mode:**

```bash
ama use
# Will prompt for token and URL if not provided
```

**Example:**

```bash
ama use --token "ama_pk_..." --url "https://edge.atmyapp.com/projects/your-project-id"
```

### migrate Command

Migrate TypeScript definitions to the AtMyApp platform.

```bash
ama migrate [options]
```

**Options:**

- `--dry-run` - Generate definitions without uploading (default: false)
- `--verbose` - Enable verbose logging (default: false)
- `--tsconfig <path>` - Path to tsconfig.json (default: "tsconfig.json")
- `--continue-on-error` - Continue processing even if some files fail (default: false)

**Examples:**

```bash
# Basic migration
ama migrate

# Dry run with verbose output
ama migrate --dry-run --verbose

# Use custom tsconfig and continue on errors
ama migrate --tsconfig ./custom-tsconfig.json --continue-on-error
```

## 🎯 Type Definitions

### Content Definitions

Define structured content using `AmaContentDef`:

```typescript
import { AmaContentDef } from "@atmyapp/core";

// Define your content structure
interface BlogPost {
  title: string;
  content: string;
  publishedAt: string;
  author: {
    name: string;
    avatar: string;
  };
  tags: string[];
}

// Create a typed content definition
export type BlogPostContent = AmaContentDef<"/blog/featured", BlogPost>;

// Export for migration
export type ATMYAPP = [BlogPostContent];
```

### Event Definitions

Define analytics events using `AmaEventDef` with ordered columns:

```typescript
import { AmaEventDef } from "@atmyapp/core";

// Define event types for analytics tracking
export type PageViewEvent = AmaEventDef<
  "page_view",
  ["page", "referrer", "timestamp", "user_id"]
>;

export type PurchaseEvent = AmaEventDef<
  "purchase",
  ["product_id", "amount", "currency", "user_id", "timestamp"]
>;

export type ClickEvent = AmaEventDef<
  "button_click",
  ["element", "position", "timestamp"]
>;

// Export all events
export type ATMYAPP = [PageViewEvent, PurchaseEvent, ClickEvent];
```

**Generated Output:**

```json
{
  "events": {
    "page_view": {
      "columns": ["page", "referrer", "timestamp", "user_id"]
    },
    "purchase": {
      "columns": ["product_id", "amount", "currency", "user_id", "timestamp"]
    },
    "button_click": {
      "columns": ["element", "position", "timestamp"]
    }
  }
}
```

### Image & File Definitions

Define optimized media with `AmaImageDef` and `AmaFileDef`:

```typescript
import { AmaImageDef, AmaFileDef, AmaImageConfig } from "@atmyapp/core";

// Image with optimization config
interface HeroImageConfig extends AmaImageConfig {
  optimizeFormat: "webp";
  maxSize: { width: 1920; height: 1080 };
  quality: 85;
}

export type HeroImage = AmaImageDef<"/images/hero", HeroImageConfig>;

// File definition
export type UserManual = AmaFileDef<"/docs/manual.pdf">;

export type ATMYAPP = [HeroImage, UserManual];
```

## 💡 Examples

### 🏪 E-commerce Setup

```typescript
// types/ecommerce.ts
import { AmaContentDef, AmaEventDef, AmaImageDef } from "@atmyapp/core";

// Product catalog
interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  inStock: boolean;
  category: string;
}

export type ProductCatalog = AmaContentDef<"/products/catalog", Product[]>;
export type FeaturedProduct = AmaContentDef<"/products/featured", Product>;

// Product images
export type ProductImage = AmaImageDef<
  "/images/products",
  {
    optimizeFormat: "webp";
    maxSize: { width: 800; height: 800 };
  }
>;

// E-commerce events
export type ProductViewEvent = AmaEventDef<
  "product_view",
  ["product_id", "category", "price", "user_id", "timestamp"]
>;

export type AddToCartEvent = AmaEventDef<
  "add_to_cart",
  ["product_id", "quantity", "price", "user_id", "timestamp"]
>;

export type PurchaseEvent = AmaEventDef<
  "purchase",
  ["order_id", "total_amount", "currency", "user_id", "timestamp"]
>;

// Export all definitions
export type ATMYAPP = [
  ProductCatalog,
  FeaturedProduct,
  ProductImage,
  ProductViewEvent,
  AddToCartEvent,
  PurchaseEvent,
];
```

### 📰 Blog & Content Management

```typescript
// types/blog.ts
import { AmaContentDef, AmaEventDef, AmaImageDef } from "@atmyapp/core";

// Blog content types
interface BlogPost {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  publishedAt: string;
  author: {
    name: string;
    email: string;
    avatar: string;
  };
  tags: string[];
  featured: boolean;
}

interface Category {
  name: string;
  slug: string;
  description: string;
  color: string;
}

// Content definitions
export type BlogPosts = AmaContentDef<"/blog/posts", BlogPost[]>;
export type FeaturedPost = AmaContentDef<"/blog/featured", BlogPost>;
export type Categories = AmaContentDef<"/blog/categories", Category[]>;

// Featured images
export type BlogHeroImage = AmaImageDef<
  "/images/blog/hero",
  {
    optimizeFormat: "webp";
    maxSize: { width: 1200; height: 630 };
  }
>;

// Blog analytics events
export type ArticleReadEvent = AmaEventDef<
  "article_read",
  ["article_id", "reading_time", "completion_rate", "referrer", "timestamp"]
>;

export type CommentEvent = AmaEventDef<
  "comment_posted",
  ["article_id", "comment_id", "user_id", "timestamp"]
>;

export type ShareEvent = AmaEventDef<
  "article_shared",
  ["article_id", "platform", "user_id", "timestamp"]
>;

export type ATMYAPP = [
  BlogPosts,
  FeaturedPost,
  Categories,
  BlogHeroImage,
  ArticleReadEvent,
  CommentEvent,
  ShareEvent,
];
```

### 🎮 User Analytics Dashboard

```typescript
// types/analytics.ts
import { AmaEventDef } from "@atmyapp/core";

// User interaction events
export type PageViewEvent = AmaEventDef<
  "page_view",
  ["page", "referrer", "user_agent", "session_id", "timestamp"]
>;

export type ClickEvent = AmaEventDef<
  "click",
  ["element", "element_text", "page", "position_x", "position_y", "timestamp"]
>;

export type FormSubmissionEvent = AmaEventDef<
  "form_submit",
  ["form_id", "form_name", "success", "validation_errors", "timestamp"]
>;

export type ScrollEvent = AmaEventDef<
  "scroll",
  ["page", "scroll_depth", "session_id", "timestamp"]
>;

export type ErrorEvent = AmaEventDef<
  "error",
  ["error_message", "error_stack", "page", "user_agent", "timestamp"]
>;

// Performance events
export type PerformanceEvent = AmaEventDef<
  "performance",
  ["page", "load_time", "dom_ready", "first_paint", "timestamp"]
>;

export type ATMYAPP = [
  PageViewEvent,
  ClickEvent,
  FormSubmissionEvent,
  ScrollEvent,
  ErrorEvent,
  PerformanceEvent,
];
```

## 🔧 Configuration

### Project Structure

```
your-project/
├── .ama/
│   ├── session.json        # Auth credentials (auto-generated)
│   └── definitions.json    # Generated definitions (auto-generated)
├── types/
│   ├── content.ts         # Content definitions
│   ├── events.ts          # Event definitions
│   └── media.ts           # Image/file definitions
├── .gitignore             # Updated automatically
└── tsconfig.json          # TypeScript config
```

### Environment Setup

The CLI automatically manages configuration through the `.ama` directory:

- **`session.json`** - Stores authentication token and project URL
- **`definitions.json`** - Generated output (for preview and debugging)
- **`.gitignore`** - Automatically updated to exclude sensitive files

### Custom Configuration

```typescript
// ama.config.ts (optional)
export default {
  include: ["src/**/*.ts", "types/**/*.ts"],
  exclude: ["**/*.test.ts"],
  description: "My Project Definitions",
  metadata: {
    version: "1.0.0",
    author: "Your Name",
    environment: process.env.NODE_ENV,
  },
};
```

## 🏗️ Architecture

### Processing Pipeline

The CLI uses a modular pipeline architecture:

```typescript
// 1. File Scanning
scanFiles(patterns)
  ↓
// 2. TypeScript Processing
createProject(files)
  ↓
// 3. Definition Extraction
processFiles(sourceFiles)
  ↓
// 4. Content Processing Pipeline
definitionPipeline.processDefinitions()
  ↓
// 5. Output Generation
generateOutput(contents)
  ↓
// 6. Upload (unless --dry-run)
uploadDefinitions(output)
```

### Built-in Processors

- **pathNormalizer** - Normalizes file paths across platforms
- **typeDetector** - Detects content, event, image, and file types
- **duplicateValidator** - Prevents duplicate path definitions
- **metadataEnricher** - Adds processing metadata to output

### Extensibility

```typescript
import {
  definitionPipeline,
  DefinitionProcessor,
  ValidationRule,
  OutputTransformer,
} from "@atmyapp/cli";

// Custom processor
const customProcessor: DefinitionProcessor = {
  name: "custom-processor",
  process: (content, context) => {
    // Your custom logic
    return modifiedContent;
  },
};

// Register custom components
definitionPipeline.addProcessor(customProcessor);
definitionPipeline.addValidator(customValidator);
definitionPipeline.addOutputTransformer(customTransformer);
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- --testNamePattern="Content Processor"
```

### Test Structure

```
tests/
├── __tests__/
│   ├── content-processor.test.ts    # Content processing tests
│   ├── definition-processor.test.ts # Pipeline tests
│   ├── schema-processor.test.ts     # TypeScript processing tests
│   └── integration.test.ts          # End-to-end tests
├── definitions/
│   ├── someFile.ts                  # Basic test definitions
│   ├── multipleDefinitions.ts       # Multi-definition tests
│   └── eventDefinitions.ts          # Event definition tests
└── setup.ts                         # Test configuration
```

### Example Test

```typescript
describe("Event Processing", () => {
  it("should separate events from regular definitions", () => {
    const contents: Content[] = [
      {
        path: "hero.json",
        structure: { title: "Hero" },
      },
      {
        path: "page_view_event",
        structure: {
          type: "event",
          properties: {
            id: { const: "page_view" },
            columns: { const: ["page", "user_id", "timestamp"] },
            type: { const: "event" },
          },
        },
      },
    ];

    const output = generateOutput(contents, {}, mockLogger);

    expect(output.definitions["hero.json"]).toBeDefined();
    expect(output.events["page_view"]).toBeDefined();
    expect(output.events["page_view"]).toHaveProperty("columns", [
      "page",
      "user_id",
      "timestamp",
    ]);
  });
});
```

## 🚨 Best Practices

### Definition Organization

✅ **Do:**

- Group related definitions in separate files
- Use descriptive type names
- Keep event column order consistent
- Include comprehensive type documentation

❌ **Don't:**

- Mix content and event definitions unnecessarily
- Use dynamic or computed type names
- Ignore TypeScript compiler errors

### Performance Tips

- ✅ Use specific include patterns to reduce scanning
- ✅ Enable `--continue-on-error` for large codebases
- ✅ Run `--dry-run` first to preview changes
- ✅ Use `--verbose` for debugging issues

### Security

- ✅ Keep `.ama/session.json` private
- ✅ Use environment variables for CI/CD
- ✅ Regularly rotate API tokens
- ✅ Review generated definitions before upload

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/atmyapp/cli.git
cd cli

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Link for local development
npm link
```

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**[🌐 AtMyApp Website](https://atmyapp.com)** • **[📚 Documentation](https://docs.atmyapp.com)** • **[💬 Support](https://atmyapp.com/support)**

Made with ❤️ by the AtMyApp team

_Migrate your definitions with confidence._

</div>
