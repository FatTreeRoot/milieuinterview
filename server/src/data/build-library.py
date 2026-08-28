"""Build the seeded interview library from the extracted documents.

Three of the documents are answer keys for another document. Those pair up:
the key restates each question and lists the points a strong answer covers, so
where a key exists it is the richer source and drives the question list, with
anything only the question sheet had appended afterwards.
"""
import json, re, pathlib, difflib, unicodedata

BASE = pathlib.Path(__file__).parent
TXT = BASE / "txt"

BOILERPLATE = re.compile(
    r'^(interviewee|interviewer|interviewers|date|name|phone|email|region|program|'
    r'posting number|confirm the position|scoring|preamble|reference|page\b|'
    r'interviewer notes|interviewer\(s\)|signature|print full name|mm/dd/yyyy|'
    r'requirements for hire|employment requirements|situation|action|result|'
    r'general questions|introduction|documentation|communication|'
    r'medication administration|crisis intervention|closing|scenario:?$)', re.I)

HEADER = re.compile(r'^[A-Z][A-Za-z /&\'-]{2,45}:?\s*$')

def clean(line):
    line = (line.replace('’', "'").replace('“', '"')
                .replace('”', '"').replace('–', '-'))
    line = re.sub(r'_{2,}', ' ', line)
    line = line.replace('☐', '')
    line = re.sub(r'/\s*5\s*$', '', line)
    line = re.sub(r'\s{2,}', ' ', line)
    return line.strip(' \t.')

def is_question(line):
    if len(line) < 12 or BOILERPLATE.match(line):
        return False
    if HEADER.match(line) and '?' not in line:
        return False
    return ('?' in line or re.match(r'^\d+[.)]\s', line)
            or re.match(r'^(tell|describe|please describe|give|explain|what|how|'
                        r'why|when|where|who|do you|have you|are you|can you|'
                        r'could you|would you|in your|tell us)\b', line, re.I))

NOT_A_QUESTION = re.compile(
    r'^\(?(print full name|signature|initials)', re.I)

def strip_num(line):
    """Drop a leading list number. Returns '' if what is left is a form field."""
    line = re.sub(r'^\d+[.)]\s*', '', line).strip()
    if NOT_A_QUESTION.match(line) or len(line) < 12:
        return ''
    return line

def lines_of(stem):
    return [clean(l) for l in (TXT / f"{stem}.txt").read_text(
        encoding='utf-8', errors='replace').splitlines()]

def questions_only(stem):
    seen, out = set(), []
    for line in lines_of(stem):
        if line and is_question(line):
            q = strip_num(line)
            if q and q.lower() not in seen:
                seen.add(q.lower())
                out.append({"text": q, "answerKey": None})
    return out

def questions_with_keys(stem):
    """Walk a key document, attaching the bullets that follow each question."""
    out = []
    for line in lines_of(stem):
        if not line:
            continue
        # Inside a key document, answer bullets sit under their question and
        # often begin with a question word too. Questions in these forms are
        # always capitalised; the bullets beneath them frequently are not.
        if is_question(line) and (line[:1].isupper() or line[:1].isdigit()):
            q = strip_num(line)
            if q:
                out.append({"text": q, "answerKey": []})
        elif out and not BOILERPLATE.match(line) and len(line) > 3:
            out[-1]["answerKey"].append(line)
    for q in out:
        bullets = [b for b in q["answerKey"] if len(b) > 3]
        q["answerKey"] = "\n".join(f"- {b}" for b in bullets) if bullets else None
    return out

def norm(s):
    s = unicodedata.normalize('NFKD', s.lower())
    return re.sub(r'[^a-z0-9 ]', '', s)

def merge(key_stem, question_stem):
    """Key document leads; questions it does not cover are appended."""
    merged = questions_with_keys(key_stem)
    known = [norm(q["text"]) for q in merged]
    for q in questions_only(question_stem):
        n = norm(q["text"])
        if not difflib.get_close_matches(n, known, n=1, cutoff=0.72):
            merged.append(q)
            known.append(n)
    return merged

# --- The library ---------------------------------------------------------
# name, description, pass threshold, and where the questions come from.
# Thresholds: the internal forms state "70% required" on the sheet itself, so
# those carry 7.0. Everything else uses the agency default of 7.5.

TYPES = [
    dict(name="Adult Internal", threshold=7.0,
         description="Internal posting for adult services staff. The paper form scores 14 questions at 5 points each, 70% to pass.",
         key="02b Adult Internal Interview Questions Answer Key",
         questions="02 Adult Internal Interview Questions"),
    dict(name="Youth Internal", threshold=7.0,
         description="Internal posting for youth services staff. The paper form scores 14 questions at 5 points each, 70% to pass.",
         key="03b Youth Internal interview form--answer key 2025",
         questions="03 Youth Internal interview form"),
    dict(name="Vocational Counsellor", threshold=7.0,
         description="Internal posting for Vocational Counsellor and Employment Specialist. 19 scored questions plus supplemental questions that carry no score.",
         key="Vocational Counsellor Interview Answer Key",
         questions="Interview-Vocational Counsellor Questions"),
    dict(name="Adult Internal to Youth", threshold=7.5,
         description="For Milieu adult services staff applying to work with youth.",
         questions="01 Milieu Children and Family Services---Used for Adult Internal to Youth"),
    dict(name="Children and Family Services, External", threshold=7.5,
         description="External applicants to Milieu Children and Family Services.",
         questions="01 Milieu Children Family Services - External Interview Questions--June 2026"),
    dict(name="Milieu Family Services", threshold=7.5,
         description="General Milieu Family Services interview.",
         questions="01 Milieu Family Services Interview "),
    dict(name="Manager, External", threshold=7.5,
         description="External applicants for a Manager posting.",
         questions="01 Manager- External Interview Questions"),
    dict(name="Assistant Manager On Call, External", threshold=7.5,
         description="External applicants for an Assistant Manager On Call posting.",
         questions="01 Assistant Manager On call- External Interview Questions"),
    dict(name="Team Leader", threshold=7.5,
         description="Team Leader posting.",
         questions="04 Team Leader Interview Questions Template"),
    dict(name="Family Services Counsellor", threshold=7.5,
         description="Family Services Program, Youth and Family Therapist.",
         questions="05 Interview questions - Family Services Program (counsellor)"),
    dict(name="Operational Generalist", threshold=7.5,
         description="Operational Generalist, a senior cross-functional leadership posting.",
         questions="Operational Generalist Position - Interview Questions"),
    dict(name="HR Assistant", threshold=7.5,
         description="HR Assistant posting.",
         questions="HR Assistant Interview Questions"),
    dict(name="General Maintenance Worker", threshold=7.5,
         description="General Maintenance Worker posting.",
         questions="Interview questions for General Maintenance worker"),
    dict(name="Victoria Staff Applicant", threshold=7.5,
         description="Applicants to the Victoria youth homes.",
         questions="Interview questions for Victoria staff applicant"),
]

# A yes/no question is one the paper form gave Yes/No boxes to. Inferring it
# from phrasing instead mislabels open questions that merely end with a
# comfort check, so the marker on the form is the signal.
YES_NO_MARKER = re.compile(r'(yes\s*:|yes\s+or\s+no|☐\s*yes)', re.I)
YES_NO_TRAILER = re.compile(
    r'\s*(yes\s*:?\s*|no\s*:?\s*|yes\s+or\s+no)+[\s.:]*$', re.I)

# Some forms put the Yes/No boxes on their own line, which does not survive
# extraction, so these stock intake questions are recognised by wording too.
# Deliberately narrow: each is binary with no open-ended part.
BINARY_INTAKE = re.compile(
    r'^(do you have (any conditions|a valid|any time off|any limitations|'
    r'any plans to be away|a study or work permit)|'
    r'have you ever been involved in (a|an) (protocol|mcfd|internal))', re.I)

def input_kind(text):
    if YES_NO_MARKER.search(text) or BINARY_INTAKE.match(text.strip()):
        return "yes_no"
    return "text"

def tidy(text):
    """Remove the Yes/No boxes left over from the paper form."""
    text = YES_NO_TRAILER.sub('', text).strip(' 	.:')
    return re.sub(r'\s{2,}', ' ', text)

def build():
    library = []
    for i, t in enumerate(TYPES):
        qs = (merge(t["key"], t["questions"]) if t.get("key")
              else questions_only(t["questions"]))
        library.append({
            "name": t["name"],
            "description": t["description"],
            "passThreshold": t["threshold"],
            "sort": i,
            "questions": [
                {
                    "text": tidy(q["text"]),
                    "answerKey": q["answerKey"],
                    "inputKind": input_kind(q["text"]),
                    "inputConfig": {},
                }
                for q in qs
            ],
        })
    return library

if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    lib = build()
    out = BASE / "seed-draft.json"
    out.write_text(json.dumps(lib, indent=2, ensure_ascii=False), encoding='utf-8')
    for t in lib:
        keyed = sum(1 for q in t["questions"] if q["answerKey"])
        yn = sum(1 for q in t["questions"] if q["inputKind"] == "yes_no")
        print(f'{len(t["questions"]):3d} questions  {keyed:3d} keyed  {yn:2d} yes/no   {t["name"]}')
