// Robust parser for navigator LLM action responses.
export function extractModelResult(res: any): { score: number | null, commentary: string | null } {
    if (!res) return { score: null, commentary: null }
    // Common direct fields
    const directScore = res?.model_score ?? res?.score ?? res?.response?.model_score ?? res?.response?.score
    const directComment = res?.model_commentary ?? res?.commentary ?? res?.response?.model_commentary ?? res?.response?.commentary ?? res?.response?.comment
    const parseNumber = (v: any) => {
        if (v == null) return null
        if (typeof v === 'number' && !isNaN(v)) return v
        const n = Number(String(v).trim())
        return isNaN(n) ? null : n
    }
    let score = parseNumber(directScore)
    let commentary = directComment ? String(directComment) : null

    const tryParseJsonFrom = (candidate: any) => {
        if (!candidate) return null
        if (typeof candidate === 'object') return candidate
        if (typeof candidate === 'string') {
            const s = candidate.trim()
            try {
                return JSON.parse(s)
            } catch (e) {
                const m = s.match(/(\{[\s\S]*\})/)
                if (m && m[1]) {
                    try { return JSON.parse(m[1]) } catch { return null }
                }
            }
        }
        return null
    }

    // Helper: if a field contains a fenced code block with JSON (```json ... ```), strip fences and parse inner JSON.
    const tryParseFencedJson = (maybe: any) => {
        if (!maybe || typeof maybe !== 'string') return null
        // Normalize common escaped characters and smart quotes before attempting parse
        const normalize = (str: string) => {
            return String(str)
                .replace(/\\r/g, '\r')
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t')
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"')
                .replace(/\u2026/g, '...')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/&amp;/g, '&')
        }
        const raw = normalize(maybe)
        // detect triple backtick fenced blocks (```json ... ```)
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
        const payload = fenced ? fenced[1] : raw
        // try to extract a JSON object substring
        const m = payload.match(/(\{[\s\S]*\})/)
        const candidate = m && m[1] ? m[1] : payload
        try {
            return JSON.parse(candidate)
        } catch (e) {
            // As a second attempt, unescape backslash-escaped quotes and try again
            try {
                const unescaped = candidate.replace(/\\"/g, '"').replace(/\\'/g, "'")
                return JSON.parse(unescaped)
            } catch (e2) {
                return null
            }
        }
    }

    if (score == null) {
        // Try to parse structured JSON from common fields. Prefer fenced code blocks in response text.
        // Include top-level `res.text` (common shape) so free-text responses
        // like { text: '...' } are considered when extracting structured JSON.
        const candidates = [res?.response?.text, res?.text, res?.answer, res?.action_plan, res?.action_plan_html, res?.response?.answer, res?.response, res]
        for (const c of candidates) {
            let parsedObj: any = null
            if (typeof c === 'string') parsedObj = tryParseFencedJson(c) || tryParseJsonFrom(c)
            else parsedObj = tryParseJsonFrom(c)
            if (parsedObj && typeof parsedObj === 'object') {
                score = parseNumber(parsedObj?.model_score ?? parsedObj?.score ?? parsedObj?.response?.model_score ?? parsedObj?.model?.score ?? parsedObj?.metrics?.model_score ?? parsedObj?.result?.score)
                if (!commentary) commentary = parsedObj?.model_commentary ?? parsedObj?.commentary ?? parsedObj?.result?.commentary ?? parsedObj?.message ?? parsedObj?.response?.model_commentary ?? null
            }
            if (score != null) break
        }
    }

    if (score == null) {
        const textFields = [res?.answer, res?.response?.text, res?.response?.answer, res?.message, res?.text, res?.action_plan, JSON.stringify(res)]
        for (const t of textFields) {
            if (!t) continue
            const m = String(t).match(/model[_-]?score\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i)
            if (m && m[1]) { score = parseNumber(m[1]); break }
        }
    }

    // Also handle cases where the response contains quoted keys outside of a JSON object
    // e.g. '"model_score": 8' or '"model_score" = "8"' embedded in free text.
    if (score == null) {
        try {
            const asText = JSON.stringify(res)
            const m2 = asText.match(/["']model[_-]?score["']\s*[:=]\s*["']?([0-9]+(?:\.[0-9]+)?)["']?/i)
            if (m2 && m2[1]) score = parseNumber(m2[1])
        } catch (e) { /* ignore */ }
    }

    if (!commentary) {
        // Prefer obvious commentary fields, but also accept top-level `text`.
        const textCandidates = [res?.commentary, res?.response?.commentary, res?.answer, res?.response?.answer, res?.action_plan, res?.action_plan_html, res?.text]
        for (const tc of textCandidates) {
            if (!tc) continue
            if (typeof tc === 'string' && tc.trim().length > 0) {
                commentary = tc
                break
            }
            if (typeof tc === 'object') {
                commentary = JSON.stringify(tc, null, 2)
                break
            }
        }
    }

    // If commentary still missing, try to pick up quoted-key commentary snippets like
    // '"model_commentary": "some text"' anywhere in the payload.
    if (!commentary) {
        try {
            const asText = JSON.stringify(res)
            const m3 = asText.match(/["']model[_-]?commentary["']\s*[:=]\s*(["'])([\s\S]*?)\1/i)
            if (m3 && m3[2]) {
                commentary = String(m3[2]).trim()
            } else {
                // relax: find key then take following text until a closing brace or end
                const m4 = asText.match(/["']model[_-]?commentary["']\s*[:=]\s*([^\n\r"]+)/i)
                if (m4 && m4[1]) commentary = String(m4[1]).trim().replace(/^['"]|['"]$/g, '')
            }
        } catch (e) { /* ignore */ }
    }

    // As a final fallback: look for generic quoted key/value fragments for either key
    if (score == null || !commentary) {
        try {
            const asText = (typeof res === 'string') ? res : JSON.stringify(res)
            const findKeyValue = (text: string, key: string) => {
                const re = new RegExp("[\\\"']?" + key + "[\\\"']?\\s*[:=]\\s*(?:\\\"([\\s\\S]*?)\\\"|'([\\s\\S]*?)'|([^,}\\n\\r]+))", 'i')
                const mm = text.match(re)
                if (!mm) return null
                return (mm[1] ?? mm[2] ?? mm[3] ?? '').toString().trim()
            }
            if (score == null) {
                const sVal = findKeyValue(asText, 'model_score')
                if (sVal) score = parseNumber(sVal)
            }
            if (!commentary) {
                const cVal = findKeyValue(asText, 'model_commentary')
                if (cVal) commentary = cVal.replace(/^['"]|['"]$/g, '')
            }
        } catch (e) { /* ignore */ }
    }

    // If commentary still missing, try to pick up quoted-key commentary snippets like
    // '"model_commentary": "some text"' anywhere in the payload.
    if (!commentary) {
        try {
            const asText = JSON.stringify(res)
            const m3 = asText.match(/["']model[_-]?commentary["']\s*[:=]\s*(["'])([\s\S]*?)\1/i)
            if (m3 && m3[2]) {
                commentary = String(m3[2]).trim()
            } else {
                // relax: find key then take following text until a closing brace or end
                const m4 = asText.match(/["']model[_-]?commentary["']\s*[:=]\s*([^\n\r]*)/i)
                if (m4 && m4[1]) commentary = String(m4[1]).trim().replace(/^['"]|['"]$/g, '')
            }
        } catch (e) { /* ignore */ }
    }

    return { score: score == null ? null : Number(score), commentary: commentary == null ? null : String(commentary) }
}

export default extractModelResult
