import re
from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass
class RedFlagRule:
    rule_id: str
    department: str
    urgency_level: str  # "critical", "urgent", "high"
    reason: str
    symptom_groups: List[List[str]]  # Each sub-list is a set of synonym patterns; ALL groups must match


@dataclass
class RedFlagResult:
    is_urgent: bool
    urgency_level: Optional[str] = None
    department: Optional[str] = None
    reason: Optional[str] = None
    matched_triggers: List[str] = None
    rule_id: Optional[str] = None


# Clinical symptom-combination trigger rules (Multilingual: English + Hindi)
RED_FLAG_RULES: List[RedFlagRule] = [
    # 1. Cardiac: Chest pain + breathlessness / shortness of breath
    RedFlagRule(
        rule_id="cardiac_chest_pain_dyspnea",
        department="Cardiology",
        urgency_level="critical",
        reason="Chest pain combined with breathlessness indicates possible acute coronary syndrome / myocardial infarction.",
        symptom_groups=[
            [
                r"\bchest pain\b",
                r"\bchest tightness\b",
                r"\bchest pressure\b",
                r"\bangina\b",
                r"\bcardiac pain\b",
                r"सीने में दर्द",
                r"छाती में दर्द",
                r"सीने में दबाव",
                r"छाती में भारीपन",
            ],
            [
                r"\bbreathlessness\b",
                r"\bshortness of breath\b",
                r"\bdifficulty breathing\b",
                r"\bdyspnea\b",
                r"\btrouble breathing\b",
                r"\bcan't breathe\b",
                r"\bcannot breathe\b",
                r"सांस की तकलीफ",
                r"सांस फूलना",
                r"सांस लेने में दिक्कत",
                r"सांस लेने में कठिनाई",
            ],
        ],
    ),
    # 2. Cardiac: Chest pain + radiating arm / jaw pain
    RedFlagRule(
        rule_id="cardiac_radiating_pain",
        department="Cardiology",
        urgency_level="critical",
        reason="Chest pain radiating to left arm, neck, or jaw indicates suspected acute myocardial infarction.",
        symptom_groups=[
            [
                r"\bchest pain\b",
                r"\bchest discomfort\b",
                r"\bchest pressure\b",
                r"सीने में दर्द",
                r"छाती में दर्द",
            ],
            [
                r"\bleft arm\b",
                r"\bradiating to arm\b",
                r"\bradiating to jaw\b",
                r"\bjaw pain\b",
                r"\bshoulder pain\b",
                r"बाएं हाथ में दर्द",
                r"जबड़े में दर्द",
                r"कंधे में दर्द",
                r"बांह में दर्द",
            ],
        ],
    ),
    # 3. Neurology: Sudden severe headache + vision changes / neurological symptoms
    RedFlagRule(
        rule_id="neuro_headache_vision",
        department="Neurology",
        urgency_level="urgent",
        reason="Sudden severe headache accompanied by vision changes suggests possible intracranial hemorrhage, stroke, or raised ICP.",
        symptom_groups=[
            [
                r"\bsudden severe headache\b",
                r"\bsevere headache\b",
                r"\bworst headache\b",
                r"\bthunderclap\b",
                r"\bthrobbing headache\b",
                r"\bintense headache\b",
                r"गंभीर सिरदर्द",
                r"अचानक सिरदर्द",
                r"तेज सिरदर्द",
                r"अत्यधिक सिरदर्द",
            ],
            [
                r"\bvision changes\b",
                r"\bblurred vision\b",
                r"\bblurring of vision\b",
                r"\bloss of vision\b",
                r"\bdiplopia\b",
                r"\bdouble vision\b",
                r"\bflashes of light\b",
                r"\bblindness\b",
                r"दृष्टि में बदलाव",
                r"धुंधला दिखना",
                r"आंखों के आगे अंधेरा",
                r"दोहरी दृष्टि",
            ],
        ],
    ),
    # 4. Neurology / Stroke: Weakness/Numbness + Slurred speech or Facial droop
    RedFlagRule(
        rule_id="neuro_stroke_symptoms",
        department="Neurology (Stroke Protocol)",
        urgency_level="critical",
        reason="Unilateral numbness/weakness combined with slurred speech or facial asymmetry strongly indicates acute stroke.",
        symptom_groups=[
            [
                r"\bweakness\b",
                r"\bnumbness\b",
                r"\bparalysis\b",
                r"\bloss of sensation\b",
                r"\bhemiparesis\b",
                r"कमजोरी",
                r"सुन्नपन",
                r"लकवा",
                r"एक तरफ कमजोरी",
            ],
            [
                r"\bslurred speech\b",
                r"\bspeech difficulty\b",
                r"\btrouble speaking\b",
                r"\bfacial droop\b",
                r"\basymmetry\b",
                r"\bcannot speak\b",
                r"बोलने में परेशानी",
                r"मुंह का टेढ़ा होना",
                r"लड़खड़ाहट",
                r"आवाज साफ न निकलना",
            ],
        ],
    ),
    # 5. Neurology / Infectious Disease: High fever + stiff neck or altered mental state
    RedFlagRule(
        rule_id="neuro_fever_stiff_neck",
        department="Neurology / Infectious Disease",
        urgency_level="urgent",
        reason="Fever accompanied by neck stiffness or disorientation indicates possible meningitis or encephalitis.",
        symptom_groups=[
            [
                r"\bfever\b",
                r"\bhigh fever\b",
                r"\bchills\b",
                r"बुखार",
                r"तेज बुखार",
                r"ठंड लगना",
            ],
            [
                r"\bstiff neck\b",
                r"\bneck stiffness\b",
                r"\bconfusion\b",
                r"\baltered mental\b",
                r"\bdisoriented\b",
                r"\bdelirium\b",
                r"गर्दन में अकड़न",
                r"गर्दन मुड़ने में दर्द",
                r"बेहोशी",
                r"भ्रम",
            ],
        ],
    ),
    # 6. Pulmonology: Hemoptysis (coughing blood) + breathlessness or chest pain
    RedFlagRule(
        rule_id="pulm_hemoptysis_dyspnea",
        department="Pulmonology",
        urgency_level="urgent",
        reason="Coughing blood combined with respiratory distress or chest pain indicates possible pulmonary embolism or severe lung pathology.",
        symptom_groups=[
            [
                r"\bcoughing blood\b",
                r"\bblood in cough\b",
                r"\bblood in sputum\b",
                r"\bhemoptysis\b",
                r"खून की खांसी",
                r"खांसी में खून",
                r"बलगम में खून",
            ],
            [
                r"\bbreathlessness\b",
                r"\bshortness of breath\b",
                r"\bchest pain\b",
                r"\bdyspnea\b",
                r"सांस की तकलीफ",
                r"सीने में दर्द",
            ],
        ],
    ),
    # 7. Gastroenterology: Severe abdominal pain + vomiting blood, black stools, or fainting
    RedFlagRule(
        rule_id="gi_severe_pain_bleeding",
        department="Gastroenterology / Emergency",
        urgency_level="urgent",
        reason="Severe abdominal pain accompanied by GI bleeding or syncope indicates possible acute GI hemorrhage or abdominal emergency.",
        symptom_groups=[
            [
                r"\bsevere abdominal pain\b",
                r"\bsevere stomach pain\b",
                r"\bintense belly pain\b",
                r"\bacute abdomen\b",
                r"पेट में तेज दर्द",
                r"पेट में असहनीय दर्द",
            ],
            [
                r"\bvomiting blood\b",
                r"\bhematemesis\b",
                r"\bblack stool\b",
                r"\bmelena\b",
                r"\bfainting\b",
                r"\bsyncope\b",
                r"\bpassed out\b",
                r"खून की उल्टी",
                r"काला मल",
                r"चक्कर खाकर गिरना",
                r"बेहोश होना",
            ],
        ],
    ),
]


def evaluate_red_flags(transcripts: List[str]) -> RedFlagResult:
    """
    Evaluates a list of transcript strings (from current and past intake turns)
    against the defined clinical symptom-combination triggers.
    
    Returns a RedFlagResult indicating if any combination triggered,
    along with the assigned department, severity, and explanation.
    """
    if not transcripts:
        return RedFlagResult(is_urgent=False)

    # Combine all turns into a unified lowercased text string for multi-turn matching
    combined_text = " ".join(t.lower() for t in transcripts if t)

    for rule in RED_FLAG_RULES:
        matched_group_words: List[str] = []
        all_groups_matched = True

        for group in rule.symptom_groups:
            group_matched = False
            for pattern in group:
                match = re.search(pattern, combined_text, re.IGNORECASE)
                if match:
                    group_matched = True
                    matched_group_words.append(match.group(0))
                    break
            if not group_matched:
                all_groups_matched = False
                break

        if all_groups_matched:
            return RedFlagResult(
                is_urgent=True,
                urgency_level=rule.urgency_level,
                department=rule.department,
                reason=rule.reason,
                matched_triggers=matched_group_words,
                rule_id=rule.rule_id,
            )

    return RedFlagResult(is_urgent=False)
