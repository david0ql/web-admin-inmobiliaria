import { SelectField } from './ui';
import { useBranch } from '../lib/branch';

/**
 * El selector de sede de una pantalla.
 *
 * Existe el del rail, pero es global y se lee como parte del menu: quien abre
 * la agenda para ver que tiene Cañaveral el jueves busca el filtro junto a los
 * demas filtros, no en la columna negra. Poniendolo en cada pantalla que
 * trabaja con datos de una oficina, la pregunta "¿de que sede?" se hace donde
 * se responde.
 *
 * Es el MISMO estado que el del rail —cambiar aqui cambia alli y al reves—, no
 * un segundo filtro que pueda contradecirlo. Dos selectores que dicen cosas
 * distintas sobre lo mismo es peor que no tener ninguno.
 *
 * No se pinta para quien no puede elegir: quien pertenece a una sede trabaja
 * siempre sobre la suya —la API le ignora la cabecera— y enseñarle un
 * desplegable con una sola opcion es ofrecerle una decision que no tiene. Con
 * una sola oficina dada de alta tampoco aparece: "todas" y "la unica" son lo
 * mismo.
 */
export function FiltroSede({
  /** Que dice la opcion de no acotar. En la agenda, "Toda la agenda". */
  etiquetaTodas = 'Todas las sedes',
  className = 'min-w-[170px]',
}: {
  etiquetaTodas?: string;
  className?: string;
}) {
  const { branches, branchId, seesAll, setBranchId } = useBranch();

  if (!seesAll || branches.length < 2) return null;

  return (
    <SelectField
      label="Sede"
      className={className}
      value={branchId ?? ''}
      onChange={(event) => setBranchId(event.target.value || null)}
    >
      <option value="">{etiquetaTodas}</option>
      {branches.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
        </option>
      ))}
    </SelectField>
  );
}
