import { defineConfig } from "@kubb/core";
import { pluginClient } from "@kubb/plugin-client";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginReactQuery } from "@kubb/plugin-react-query";
import { pluginTs } from "@kubb/plugin-ts";
import { configDotenv } from "dotenv";

configDotenv();

const apiDocs = process.env.API_DOCS_URL || "http://localhost:3200/api-docs-json";
const cacheBustedApiDocs = `${apiDocs}?v=${Date.now()}`;
const openApiPath = process.env.OPENAPI_PATH || "./openapi.json";
const sourcePath = openApiPath === "remote" ? cacheBustedApiDocs : openApiPath;

export default defineConfig({
  root: ".",
  input: {
    path: sourcePath,
  },
  output: {
    path: "./src/shared/api/.generated",
    clean: true,
    extension: {
      ".ts": "",
    },
  },
  plugins: [
    pluginOas(),
    pluginTs(),
    pluginClient({
      output: {
        path: "./clients",
        barrelType: "named",
      },
      group: { type: "tag" },
      operations: true,
      pathParamsType: "inline",
      dataReturnType: "data",
      importPath: "@/shared/api/client",
    }),
    pluginReactQuery({
      client: {
        importPath: "@/shared/api/client",
        dataReturnType: "data",
      },
      output: {
        path: "./hooks",
      },
      group: {
        type: "tag",
      },
      mutation: {
        methods: ["post", "put", "patch", "delete"],
      },
      paramsType: "inline",
      pathParamsType: "inline",
      suspense: false,
    }),
  ],
});
