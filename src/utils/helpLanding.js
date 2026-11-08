// A control's id names the control; the row around it is what the eye reads.
export function findHelpTarget(id, doc) {
  const element = id ? doc.getElementById(id) : null;
  if (!element) return null;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName)) {
    return element.closest("[data-help-row]") || element.parentElement;
  }
  return element;
}
