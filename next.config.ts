import type { NextConfig } from "next";
import path from "node:path";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

// withWorkflow enables the 'use workflow' and 'use step' directives.
// Without it, start() throws an "invalid workflow function" error
// because the directives aren't transformed at build time.
export default withWorkflow(nextConfig);
