/**
 * La reserva de Sangre de un GHOUL — la regla del libro, aislada en un módulo puro.
 *
 * ## Qué defecto cierra
 *
 * Un Ghoul NO es un Vástago, y su reserva de Sangre no sale de la tabla de Generación. El sistema
 * derivaba `bloodpool.max` con `_calculteMaxBlood(generación)` para cualquier actor que pasara por
 * `_handleVampireCalculations`, así que un Ghoul con un campo `generation` en `bio.splatfields`
 * — puesto por un arrastre de Splat, por el exportador de wodchar o por un DJ tecleando en Bio —
 * heredaba 10, 13 o 15 puntos de Sangre como si fuera un Cainita de esa Generación.
 *
 * Hoy eso NO pasaba por accidente y no por diseño: la plantilla de Ghoul no trae campo `generation`,
 * así que la guarda `if (bio.splatfields.generation != undefined)` no entraba. Un accidente no es una
 * garantía — basta que alguien declare el campo para que el defecto vuelva. Esta regla lo hace
 * explícito.
 *
 * ## La regla, citada
 *
 * v20-core-rulebook-es L15308 (Paso Cinco de «Crear un Ghoul»):
 *   «Apunta tu Humanidad (igual a Consciencia + Autocontrol), Fuerza de Voluntad (igual a Coraje) y
 *    reserva de Sangre (1). Los Ghouls no pueden elegir una Senda de Iluminación.»
 * v20-core-rulebook-es L15366:
 *   «los Ghouls empiezan con un punto de Sangre, y tienen una reserva de Sangre de 2 o más,
 *    dependiendo de su edad»
 *
 * Es decir: empieza con 1 punto y su MÁXIMO es 2.
 *
 * ## LO QUE ESTE MÓDULO NO MODELA, y por qué se dice en voz alta
 *
 * v20-core-rulebook-es L15432 da la subida por edad: un Aparecido gana +1 de capacidad por siglo, y
 * un Ghoul que no sea Aparecido +1 por cada DOS siglos (de ahí el ejemplo del libro: un Ghoul de 800
 * años tiene reserva 6). Aquí el máximo es una constante, no una función de la edad, por una razón
 * medible: **la ficha no tiene campo de edad**. Inventar uno sería declarar un dato que ningún
 * productor escribe — ni el exportador de wodchar, ni el diálogo de variante, ni ninguna plantilla —
 * y quedaría exactamente igual de muerto que los `haspathos`/`hasangst` que este repo ya borró por
 * eso mismo. El valor sale de `CONFIG.worldofdarkness.ghoul` para que, el día que exista ese campo,
 * haya UN sitio donde enchufarlo.
 *
 * ## Por qué un módulo aparte y no un `if` dentro de `wod-actor-base.js`
 *
 * Mismo motivo que `advantage-derivations.js`: `wod-actor-base.js` no se puede importar fuera de
 * Foundry (arrastra el documento Actor entero), así que una regla escondida ahí no se puede probar
 * con `node --test`. Aquí no se importa nada, así que se prueba directamente.
 */

/** El máximo por defecto de la reserva de Sangre de un Ghoul (v20 L15366: «una reserva de Sangre de 2»). */
export const GHOUL_BLOODPOOL_MAX = 2;

/** Los puntos de Sangre con los que empieza un Ghoul recién creado (v20 L15308: «reserva de Sangre (1)»). */
export const GHOUL_BLOODPOOL_START = 1;

/**
 * Puntos de Sangre gastables por turno. 1, como cualquier Vástago de 13ª a 10ª Generación
 * (`_calculteMaxBlood`'s sibling `_calculteMaxBloodSpend` devuelve 1 por defecto). El libro no da a
 * los Ghouls ningún ritmo de gasto propio, así que se queda en el mínimo en vez de inventarse uno.
 */
export const GHOUL_BLOOD_PERTURN = 1;

/**
 * ¿Es este actor un Ghoul?
 *
 * Se pregunta por `settings.variant`, que es donde el sistema YA lo dice: `config.js` declara `ghoul`
 * entre las variantes de `mortal` (`wod.variant.mortal.ghoul`) y `CreateHelper.SetMortalVariant`
 * escribe `variant: "ghoul"` al pulsar ese botón. NO se pregunta por `splat` ni por `variantsheet`:
 * un Ghoul es `splat: "mortal"` con `variantsheet: "vampire"` (así lo deja `SetMortalVariant`), de
 * modo que `variantsheet` responde «vampire» — que es lo que queremos para las Disciplinas y el
 * tema de la hoja, y exactamente lo que NO queremos para la reserva de Sangre. Los dos ejes son
 * distintos a propósito; leer el equivocado es el defecto que este módulo cierra.
 *
 * Tolera un actor a medio construir (sin `system`, sin `settings`) devolviendo `false` en vez de
 * lanzar: se llama desde `prepareDerivedData`, que corre sobre documentos en cualquier estado.
 *
 * @param {object} actorData - un documento de Actor (o algo con su forma).
 * @returns {boolean}
 */
export function isGhoul(actorData) {
    return actorData?.system?.settings?.variant === "ghoul";
}

/**
 * Los límites de la reserva de Sangre de un Ghoul.
 *
 * Lee `CONFIG.worldofdarkness.ghoul` cuando existe (dentro de Foundry) y cae a las constantes de
 * este módulo cuando no (tests, un item sin dueño, un `CONFIG` a medio inicializar). El `try` es el
 * mismo patrón que `computeAdvantageDerivedData` usa para `CONFIG.worldofdarkness.rollSettings`.
 *
 * @returns {{max: number, perturn: number, start: number}}
 */
export function ghoulBloodpoolLimits() {
    let declared;

    try {
        declared = CONFIG.worldofdarkness.ghoul;
    }
    catch (e) {
        declared = undefined;
    }

    return {
        max: Number.isInteger(declared?.bloodpoolmax) ? declared.bloodpoolmax : GHOUL_BLOODPOOL_MAX,
        perturn: Number.isInteger(declared?.bloodperturn) ? declared.bloodperturn : GHOUL_BLOOD_PERTURN,
        start: Number.isInteger(declared?.bloodpoolstart) ? declared.bloodpoolstart : GHOUL_BLOODPOOL_START
    };
}
