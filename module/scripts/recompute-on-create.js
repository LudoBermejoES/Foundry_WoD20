/**
 * recompute-totals-on-actor-import (opción A2) — un `PC` recién creado con Items embebidos
 * (importado, duplicado, o creado por cualquier vía que llame a `Actor.create()` con `items`
 * en el mismo payload) nunca dispara `calculateTotals`: `wod-actor-base.js`'s `_onUpdate`
 * (línea ~864: `if (this.type !== "PC") { ... }`) y `_onUpdateDescendantDocuments` (línea
 * ~991: `if (this.type === "PC" || this.type === "Chantry") return;`) excluyen
 * explícitamente al `PC` de ese recálculo automático — es un mecanismo pensado para
 * NPC/Criatura/Espíritu, apagado a propósito para el tipo que este proyecto importa y
 * exporta. Ver `openspec/changes/recompute-totals-on-actor-import/design.md` D1.
 *
 * Este fichero ESPEJA ese mecanismo, sin reactivarlo, para un único hueco: la creación. No
 * toca `_onUpdate` ni `_onUpdateDescendantDocuments`.
 *
 * Deliberadamente sin ningún import de Foundry (ni `game`, ni `foundry.utils`, ni `CONFIG`),
 * igual que `armor-dexpenalty.js` — lo que permite testear la REGLA con `node --test`, sin
 * arrancar el sistema. `calculateTotals`/`foundry.utils.duplicate` se inyectan como
 * dependencias; `actor.update()` se invoca directamente sobre el propio actor, igual que hace
 * `armor-dexpenalty.js` con `item.update()`.
 */

/**
 * ¿Debe este actor recalcular sus totales al crearse?
 *
 * Acotado a propósito, para que un import masivo de decenas de personajes cueste UNA
 * escritura por actor (no por Item, no siempre):
 *   - solo `PC` — el mecanismo `isupdated` sigue intacto y sin tocar para los demás tipos;
 *   - solo si trae Items YA EMBEBIDOS (un `PC` recién creado desde cero por la UI de Foundry
 *     no trae ninguno en este punto — `_preCreate` no le añade Items para el tipo `PC` puro,
 *     a diferencia de mortal/vampiro/mago/etc — así que esta función es un no-op de coste
 *     cero para ese caso, el más frecuente);
 *   - solo si quien recibe el hook tiene permiso de `OWNER` (nivel 3) sobre el actor —
 *     `_onCreate` corre en TODOS los clientes conectados, y un observador sin permiso de
 *     escritura no debe intentar un `actor.update()` que Foundry rechazaría.
 *
 * @param {{type?: string, items?: {size?: number, length?: number}, permission?: number}} actor
 * @returns {boolean}
 */
export function shouldRecomputeTotalsOnCreate(actor) {
	if (!actor || actor.type !== "PC") return false;

	const itemCount = actor.items?.size ?? actor.items?.length ?? 0;
	if (itemCount === 0) return false;

	// Un `permission` ausente se trata como "sin permiso" (0), no como "sin restricción" --
	// más estricto que la comparación `actor.permission < 3` de `_onUpdate` (donde
	// `undefined < 3` es `false` y por tanto NO bloquea), a propósito: este es código nuevo y
	// no hay razón para heredar ese caso límite sin cubrir.
	const permission = actor.permission ?? 0;
	if (permission < 3) return false;

	return true;
}

/**
 * Recalcula los totales de un `PC` recién creado, si `shouldRecomputeTotalsOnCreate` lo pide.
 * Reproduce el mismo patrón de tres pasos que `action-helpers.js`'s `OnItemActive` (el clic de
 * equipar) usa para un `PC` ya existente: duplicar -> `calculateTotals` -> marcar
 * `isupdated = true` -> `actor.update()`. Se pone a `true` (no a `false`, como hace
 * `OnItemActive`) porque aquí SÍ acabamos de calcular los totales -- y aunque hoy esa bandera
 * es inerte para un `PC` (`_onUpdate` la ignora en su rama excluida), dejarla en `true` es la
 * lectura correcta si esa exclusión se levantara alguna vez.
 *
 * Nunca lanza: un fallo aquí (permiso denegado en el `update`, un actor a medio formar) se
 * registra y se traga, para no abortar la creación del actor por un recálculo que es una
 * mejora, no un requisito de la propia creación.
 *
 * Sin reentrada: escribe SOLO en el propio Actor (`actor.update(...)`), nunca en un Item
 * embebido -- así que no puede disparar `_onUpdateDescendantDocuments` (que además ya excluye
 * `PC`). Si el `update()` resultante reentra en `_onUpdate`, la rama que allí existe para
 * `PC` es un no-op (`if (this.type !== "PC") { ... todo el trabajo ... }`), así que no hay
 * bucle -- ver design.md D1 y el test de cableado en `recompute-on-create.test.mjs`.
 *
 * @param {object} actor - El Actor recién creado. Debe exponer `.type`, `.items`,
 *   `.permission`, `.name` y `.update(data)`.
 * @param {{duplicate: (a: object) => object, calculateTotals: (a: object) => Promise<object>,
 *   logger?: (err: Error) => void}} deps
 * @returns {Promise<boolean>} `true` si se recalculó y escribió, `false` en cualquier otro
 *   caso (no aplica, o falló y se registró el error).
 */
export async function recomputeTotalsOnCreate(actor, { duplicate, calculateTotals, logger = console.error } = {}) {
	if (!shouldRecomputeTotalsOnCreate(actor)) return false;

	try {
		let actorData = duplicate(actor);
		actorData = await calculateTotals(actorData);
		actorData.system.settings.isupdated = true;
		await actor.update(actorData);
		return true;
	}
	catch (err) {
		err.message = `Cannot recalculate totals for newly created Actor ${actor?.name}: ${err.message}`;
		logger(err);
		return false;
	}
}
