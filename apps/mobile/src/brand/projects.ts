/**
 * Which brand photo belongs to a project (docs/DESIGN.md: hero photo per project on the owner's home), using
 * the same names as the prototype: J188, JAD 288 (also "J288"), 171 Garden Heights ("171GH").
 */
export type ProjectKey = 'j188' | 'jad288' | '171gh';

export function projectKey(project: string | null): ProjectKey | null {
  if (project === null) return null;
  const name = project.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (name === 'J188' || name === 'JAD188') return 'j188';
  if (name === 'J288' || name === 'JAD288') return 'jad288';
  if (name.startsWith('171')) return '171gh';
  return null;
}
