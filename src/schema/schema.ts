/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { z } from "zod";
import { WrapOptional } from "../lib/option";
import * as result from "../lib/result";
import { ErrorCode, NotFoundError, StatusError } from "../lib/status_error";
import { setAttributeOnActiveSpan } from "../logging/tracing/set-attributes-on-active-span";
import { Span } from "../logging/tracing/span.decorator";

export type VersionedSchema<UnderlyingSchema, Version> = UnderlyingSchema extends {
    version: number;
}
    ? never
    : UnderlyingSchema & { version: Version };

type ConverterFunc<
    Prev extends VersionedSchema<any, any>,
    Curr extends VersionedSchema<any, any>
> = (data: Prev) => result.Result<Curr, StatusError>;

type IncDigit = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
type Digit = IncDigit[number];

type Inc<T extends string> = T extends `${infer F}${Digit}`
    ? T extends `${F}${infer L extends Digit}`
        ? `${L extends 9 ? Inc<F> : F}${IncDigit[L]}`
        : never
    : 1;

type Increment<T extends number> = number extends T
    ? number
    : `${T}` extends `${string}${"." | "+" | "-" | "e"}${string}`
      ? number
      : Inc<`${T}`> extends `${infer N extends number}`
        ? N
        : never;

type GetConverters<
    Schemas extends any[],
    Prev extends ConverterFunc<any, any>[] = [],
    Index extends number = 0
> = Schemas extends []
    ? never
    : Schemas extends [unknown]
      ? Prev
      : Schemas extends [infer P, infer N, ...infer Tail]
        ? GetConverters<
              [N, ...Tail],
              [
                  ...Prev,
                  ConverterFunc<VersionedSchema<P, Index>, VersionedSchema<N, Increment<Index>>>
              ],
              Increment<Index>
          >
        : never;

type AnyValueInTuple<T extends readonly unknown[]> = T[number];

export class SchemaManager<Schemas extends VersionedSchema<any, any>[], MaxVersion extends number> {
    constructor(
        private _name: string,
        private _zodSchemas: readonly z.ZodObject<any>[],
        private _converters: GetConverters<Schemas>,
        private _default?: () => Schemas[0]
    ) {}

    /**
     * Updates the schema of the input data to the lastest version.
     * @param data the schema to validate and update
     * @returns the latest schema version data
     */
    @Span()
    public updateSchema<T extends VersionedSchema<unknown, unknown>>(
        data: T | null | undefined
    ): result.Result<Schemas[MaxVersion], StatusError> {
        const dataOpt = WrapOptional<VersionedSchema<unknown, unknown>>(data);
        if (dataOpt.none) {
            return this.getDefault();
        }
        const versionOpt = WrapOptional<number>(dataOpt.safeValue().version as number);
        if (versionOpt.none) {
            return this.getDefault();
        }
        if (versionOpt.safeValue() < 0 || versionOpt.safeValue() > this._converters.length) {
            return this.getDefault();
        }
        return this.loadDataInternal(data, versionOpt.safeValue());
    }

    /**
     * Gets the default configuration of the schema.
     * @returns latest schema version
     */
    @Span()
    public getDefault(): result.Result<Schemas[MaxVersion], StatusError> {
        const defaultFunc = WrapOptional(this._default);
        if (defaultFunc.none) {
            return result.Err(NotFoundError(`No default schema found for ${this._name}.`));
        }
        return this.loadDataInternal(defaultFunc.safeValue()(), 0);
    }

    @Span()
    private loadDataInternal(
        data: AnyValueInTuple<Schemas>,
        version: number
    ): result.Result<Schemas[MaxVersion], StatusError> {
        setAttributeOnActiveSpan(`version`, version);

        const zodSchema = this._zodSchemas[version];
        if (!zodSchema) {
            return result.Err(new StatusError(ErrorCode.INTERNAL, `No zod schema found for version ${version}`));
        }

        const parseResult = zodSchema.safeParse(data);
        if (!parseResult.success) {
            return result.Err(new StatusError(ErrorCode.INVALID_ARGUMENT, `Schema validation failed for ${this._name} version ${version}: ${parseResult.error.message}`));
        }

        let validatedData: any = parseResult.data;
        for (let i = version; i < this._converters.length; i++) {
            const converter = this._converters[i];
            if (!converter) {
                return result.Err(new StatusError(ErrorCode.INTERNAL, `No converter found for version ${i}`));
            }
            const convertedResult = (converter as ConverterFunc<any, any>)(validatedData);
            if (result.IsErr(convertedResult)) {
                return convertedResult;
            }
            validatedData = convertedResult.val;

            const nextZodSchema = this._zodSchemas[i + 1];
            if (!nextZodSchema) {
                return result.Err(new StatusError(ErrorCode.INTERNAL, `No zod schema found for version ${i + 1}`));
            }
            const nextParseResult = nextZodSchema.safeParse(validatedData);
            if (!nextParseResult.success) {
                return result.Err(new StatusError(ErrorCode.INVALID_ARGUMENT, `Post-conversion schema validation failed for ${this._name} version ${i+1}: ${nextParseResult.error.message}`));
            }
            validatedData = nextParseResult.data;
        }

        return result.Ok(validatedData);
    }

    public getLatestVersion(): number {
        return this._converters.length;
    }
}
