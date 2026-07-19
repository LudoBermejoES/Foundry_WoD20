const DISCIPLINES_COMPENDIUM = "world.disciplines";
const APOCALYPTIC_FORMS_JSON = "systems/worldofdarkness/data/demon/apocalyptic-form-abilities.json";

export default class ItemHelper {

    static _apocalypticFormsCache = null;

    /**
     * Hämtar disciplines.json och returnerar listan av disciplin-id i ordning.
     * Använd för att veta vilket index som är vilken disciplin (0 = första, 1 = andra, …).
     * @returns {Promise<string[]>} Array med disciplineId i samma ordning som i filen
     */
    static async GetDisciplineIndexList() {
        const res = await fetch("systems/worldofdarkness/assets/data/disciplines.json");
        const json = await res.json();
        const disciplines = json?.disciplines;
        if (!disciplines || typeof disciplines !== "object") return [];
        return Object.keys(disciplines);
    }

    /**
     * Skriver ut index → disciplinnamn i konsolen så du vet vilket index du ska använda.
     * Exempel: 0 Auspex, 1 Obfuscate, …
     */
    static async LogDisciplineIndices() {
        const ids = await ItemHelper.GetDisciplineIndexList();
        const json = (await (await fetch("systems/worldofdarkness/assets/data/disciplines.json")).json()).disciplines;
        console.log("Discipliner (index → namn):");
        ids.forEach((id, i) => console.log(`  ${i}  ${json[id]?.name ?? id}`));
        return ids;
    }

    /**
     * Importerar en disciplin (och dess powers) enligt index i listan.
     * Index 0 = första i listan, 1 = andra, osv. Skapar ingen mapp – du kan skapa mapp manuellt och dra in dem.
     * @param {number} index - Index i disciplinlistan (0, 1, 2, …)
     * @returns {Promise<{discipline: Item, powers: number, name: string}>}
     */
    static async CreateDisciplineByIndex(index) {
        const ids = await ItemHelper.GetDisciplineIndexList();
        if (index < 0 || index >= ids.length) {
            throw new Error(`Ogiltigt index ${index}. Giltiga index: 0–${ids.length - 1}. Använd ItemHelper.LogDisciplineIndices() för att se listan.`);
        }
        const disciplineId = ids[index];
        const res = await fetch("systems/worldofdarkness/assets/data/disciplines.json");
        const json = await res.json();
        const disciplineData = json?.disciplines?.[disciplineId];
        if (!disciplineData) throw new Error(`Disciplin "${disciplineId}" hittades inte.`);
        const result = await ItemHelper.CreateDiscipline(disciplineData, disciplineId);
        ui.notifications.info(`Importerade: ${disciplineData.name} (${result.powers} powers). Skapa mapp och dra in dem om du vill.`);
        return { ...result, name: disciplineData.name };
    }

    /**
     * Skapar en disciplin och alla dess powers i kompendiet från given data.
     * Läser inte någon fil – använd den data som skickas in. Skapar ingen mapp.
     * @param {Object} disciplineData - Objekt med { name, itemData, powers }
     * @param {string} [disciplineId] - Valfritt ID (t.ex. "obfuscate") för loggning
     * @returns {Promise<{discipline: Item, powers: number}>}
     */
    static async CreateDiscipline(disciplineData, disciplineId = "") {
        try {
            const label = disciplineId || disciplineData.name || "?";
            console.log(`Creating discipline: ${disciplineData.name}`);

            const disciplineItemData = foundry.utils.duplicate(disciplineData.itemData);

            if (disciplineItemData.system?.settings) {
                disciplineItemData.system.settings.iscreated = true;
                disciplineItemData.system.settings.version = game.system.version || "";
            }

            const created = await Item.createDocuments([disciplineItemData], {
                pack: DISCIPLINES_COMPENDIUM
            });
            const disciplineItem = created[0];
            const disciplineItemId = disciplineItem._id;

            console.log(`Created discipline: ${disciplineData.name} (ID: ${disciplineItemId})`);

            const powersArray = Object.values(disciplineData.powers || {}).sort((a, b) => a.level - b.level);
            const powerItemsData = [];

            for (const power of powersArray) {
                const powerItemData = foundry.utils.duplicate(power.itemData);
                if (!powerItemData.system) powerItemData.system = {};
                if (!powerItemData.system.settings) powerItemData.system.settings = {};
                powerItemData.system.settings.parentid = disciplineItemId;
                powerItemData.system.settings.iscreated = true;
                powerItemData.system.settings.version = game.system.version || "";
                powerItemsData.push(powerItemData);
            }

            if (powerItemsData.length > 0) {
                await Item.createDocuments(powerItemsData, {
                    pack: DISCIPLINES_COMPENDIUM
                });
                console.log(`Created ${powerItemsData.length} powers for ${disciplineData.name}`);
            }

            return { discipline: disciplineItem, powers: powerItemsData.length };
        } catch (error) {
            const label = disciplineId || disciplineData?.name || "?";
            console.error(`Error creating discipline "${label}":`, error);
            ui.notifications.error(`Failed to create discipline "${label}": ${error.message}`);
            throw error;
        }
    }

    /**
     * Läser disciplines.json och anropar CreateDiscipline() för varje disciplin (en efter en).
     * Skapar inga mappar – du kan skapa mappar manuellt och dra in dem.
     */
    static async CreateAllDisciplines() {
        try {
            const ids = await ItemHelper.GetDisciplineIndexList();
            const res = await fetch("systems/worldofdarkness/assets/data/disciplines.json");
            const json = await res.json();
            const disciplines = json?.disciplines;
            if (!disciplines || typeof disciplines !== "object") {
                throw new Error("disciplines.json has no 'disciplines' object");
            }

            let totalPowers = 0;
            for (let i = 0; i < ids.length; i++) {
                const disciplineId = ids[i];
                const disciplineData = disciplines[disciplineId];
                const result = await ItemHelper.CreateDiscipline(disciplineData, disciplineId);
                totalPowers += result.powers;
            }

            const count = ids.length;
            console.log(`Successfully created ${count} disciplines with ${totalPowers} total powers.`);
            ui.notifications.info(`Created ${count} disciplines with ${totalPowers} powers`);
        } catch (error) {
            console.error("Error creating all disciplines:", error);
            ui.notifications.error(`Failed to create disciplines: ${error.message}`);
            throw error;
        }
    }

    /**
     * Läser apocalyptic-form-abilities.json (cachad efter första anropet).
     * @returns {Promise<Object>}
     */
    static async GetApocalypticFormCatalog() {
        if (!ItemHelper._apocalypticFormsCache) {
            const res = await fetch(APOCALYPTIC_FORMS_JSON);
            if (!res.ok) {
                throw new Error(`Failed to load ${APOCALYPTIC_FORMS_JSON}: ${res.status}`);
            }
            ItemHelper._apocalypticFormsCache = await res.json();
        }
        return ItemHelper._apocalypticFormsCache;
    }

    /**
     * Hämtar en apocalyptic form från JSON-katalogen och returnerar Trait-itemdata.
     * Sparar inget i världen eller kompendium — använd returvärdet för senare skapande.
     * @param {string} key - Nyckel i katalogen (t.ex. "armor", "claws_teeth")
     * @returns {Promise<Object>} Item-dokumentdata redo för Item.create / createEmbeddedDocuments
     */
    static async CreateApocalypticForm(key) {
        const catalog = await ItemHelper.GetApocalypticFormCatalog();
        const entry = catalog.abilities?.find(ability => ability.key === key);

        if (!entry) {
            throw new Error(`Apocalyptic form "${key}" not found.`);
        }

        const itemData = foundry.utils.duplicate(entry.item);

        if (!itemData.system) {
            itemData.system = {};
        }

        itemData.system.iscreated = true;
        itemData.system.version = game.system?.version ?? "";

        if (!itemData.system.description && entry.mechanics?.summary) {
            itemData.system.description = `<p>${entry.mechanics.summary}</p>`;
        }

        return itemData;
    }
}
