import { promises as fs } from "fs";
import { NOTES_SCHEMA_MANAGER } from "./src/schema/notes/notes.schema.ts";
import { ZodObject, ZodUnion } from "zod";

async function updateFirestoreRules() {
    try {
        // HACK: Accessing private properties. This is for a build script, so it's acceptable.
        const manager = NOTES_SCHEMA_MANAGER as any;
        const latestVersion = manager.getLatestVersion();
        const latestSchema = manager._zodSchemas[latestVersion];

        if (!latestSchema) {
            throw new Error(`Could not find schema for version ${latestVersion}`);
        }

        const keySet = new Set<string>();

        const unionSchema = latestSchema._def.left;
        if (unionSchema instanceof ZodUnion) {
            unionSchema.options.forEach(option => {
                if (option instanceof ZodObject) {
                    Object.keys(option.shape).forEach(key => keySet.add(key));
                }
            });
        }

        const intersectionSchema = latestSchema._def.right;
        if (intersectionSchema instanceof ZodObject) {
            Object.keys(intersectionSchema.shape).forEach(key => keySet.add(key));
        }

        const allKeys = Array.from(keySet).sort();

        const firestoreRulesPath = "./firestore.rules";
        let rulesContent = await fs.readFile(firestoreRulesPath, "utf-8");

        const keysString = `["${allKeys.join('", "')}"]`;

        const regex =
            /(match \/notes\/{file} {[\s\S]*?allow create, update: if request\.auth != null && request\.resource\.data\.keys\(\)\.hasOnly\()([\s\S]*?)(\) && request\.auth\.uid == request\.resource\.data\.userId;[\s\S]*?})/;

        if (!regex.test(rulesContent)) {
            throw new Error(
                "Could not find the notes rule to update in firestore.rules"
            );
        }

        const newRulesContent = rulesContent.replace(
            regex,
            `$1${keysString}$3`
        );

        await fs.writeFile(firestoreRulesPath, newRulesContent, "utf-8");

        console.log("firestore.rules has been updated successfully.");
    } catch (error) {
        console.error("Error updating firestore.rules:", error);
        process.exit(1);
    }
}

updateFirestoreRules();
