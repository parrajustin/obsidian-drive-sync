import { describe, test, expect } from "@jest/globals";
import type { SettingSchemaV1 } from "../../src/settings/settings_data";
import { UpdateSchemaV1ToV2 } from "../../src/settings/settings_data";

describe("UpdateSettingsSchema", () => {
    test("updates vesion 1 to 2", () => {
        const version1Schema: SettingSchemaV1 = {
            clientId: "id",
            syncers: [],
            email: "email",
            password: "pass"
        };

        const updatedSchema = UpdateSchemaV1ToV2(version1Schema);
        expect(updatedSchema).toStrictEqual({
            clientId: "id",
            syncers: [],
            email: "email",
            password: "pass",
            version: "v2"
        });
    });
});
