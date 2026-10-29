/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  A2uiExpressionError,
  DynamicStringSchema,
  DynamicValueSchema,
  createFunctionImplementation,
  type FunctionImplementation,
} from '@a2ui/web_core/v1_0';
import {search} from 'jmespath';
import {z} from 'zod';

/** The JMESPath specification that `transformData` implements, with no extensions. */
const JMESPATH_SPEC_URL = 'https://jmespath.org/specification.html';

/** Names of the errors the `jmespath` library raises for an expression that does not parse. */
const PARSE_ERROR_NAMES: ReadonlySet<string> = new Set(['LexerError', 'ParserError']);

/** Function API definition for `transformData`. */
export const TransformDataApi = {
  name: 'transformData' as const,
  returnType: 'any' as const,
  schema: z.object({
    // Quoted to prevent Google Closure Compiler property renaming.
    'jmespath': DynamicStringSchema.describe(
      `A JMESPath expression (${JMESPATH_SPEC_URL}) evaluated against \`data\`. Standard JMESPath only, no extensions.`,
    ),
    'data': DynamicValueSchema.describe('The input data to evaluate the expression against.'),
  }),
  description: `Evaluates a JMESPath expression (${JMESPATH_SPEC_URL}) against \`data\`. Standard JMESPath only, no extensions.`,
};

/**
 * Evaluates the JMESPath expression in `jmespath` against `data` and returns the result, or `null`
 * when the expression selects nothing.
 *
 * @throws A2uiExpressionError if the expression does not parse, or if evaluating it fails, such as
 *   a function called with an argument of the wrong type.
 */
export const TransformDataImplementation: FunctionImplementation = createFunctionImplementation(
  TransformDataApi,
  args => {
    const expression = String(args['jmespath']);
    try {
      return search(args['data'], expression);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const message =
        error instanceof Error && PARSE_ERROR_NAMES.has(error.name)
          ? `Invalid JMESPath expression: ${expression} (${reason})`
          : `JMESPath expression ${expression} failed: ${reason}`;
      throw new A2uiExpressionError(message, 'transformData', error);
    }
  },
);
