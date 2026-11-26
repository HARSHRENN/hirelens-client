export const TEMPLATE_FIELDS: Record<string,string>
export const TEMPLATE_PURPOSES: Record<string,string>
interface MessageTemplate {body?:string;subject?:string;link?:string}
export function editableTemplate<T extends MessageTemplate>(template:T): T
export function interpolate(text:string|undefined,vars?:Record<string,string>):string
export function validMessageLink(link:string|undefined):boolean
export function renderTemplate(template:MessageTemplate|undefined,vars?:Record<string,string>):{subject:string;body:string;link:string}
export function escapeHtml(value:unknown):string
export function trackerHtml(rows:unknown[][]):string
export function trackerText(rows:unknown[][]):string
