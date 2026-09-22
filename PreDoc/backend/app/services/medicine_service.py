import csv
import os
import re
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Essential top clinical staple medicines to guarantee prompt and prominent matching
# for common doctor lookups (e.g., when typing 'D', 'Dol', 'Parac', etc.)
CURATED_COMMON_MEDICINES = [
    {
        "name": "Dolo 650 Tablet",
        "composition": "Paracetamol (650mg)",
        "dosage": "650mg",
        "uses": "Fever, Mild to moderate pain, Body ache, Headache",
        "manufacturer": "Micro Labs Ltd",
        "form": "Tablet",
    },
    {
        "name": "Doxycycline 100mg Capsule",
        "composition": "Doxycycline (100mg)",
        "dosage": "100mg",
        "uses": "Bacterial infections, Acne, Respiratory infections, Lyme disease",
        "manufacturer": "Cipla Ltd",
        "form": "Capsule",
    },
    {
        "name": "Diclofenac 50mg Tablet",
        "composition": "Diclofenac Sodium (50mg)",
        "dosage": "50mg",
        "uses": "Pain relief, Arthritis, Muscle pain, Post-operative inflammation",
        "manufacturer": "Novartis India Ltd",
        "form": "Tablet",
    },
    {
        "name": "Domperidone 10mg Tablet",
        "composition": "Domperidone (10mg)",
        "dosage": "10mg",
        "uses": "Nausea, Vomiting, Gastric motility disorders, Indigestion",
        "manufacturer": "Torrent Pharmaceuticals Ltd",
        "form": "Tablet",
    },
    {
        "name": "Paracetamol 500mg Tablet",
        "composition": "Paracetamol (500mg)",
        "dosage": "500mg",
        "uses": "Fever and mild to moderate pain",
        "manufacturer": "GlaxoSmithKline",
        "form": "Tablet",
    },
    {
        "name": "Azithromycin 500mg Tablet",
        "composition": "Azithromycin (500mg)",
        "dosage": "500mg",
        "uses": "Respiratory tract infections, Throat infections, Bacterial pneumonia",
        "manufacturer": "Cipla Ltd",
        "form": "Tablet",
    },
    {
        "name": "Pantoprazole 40mg Tablet",
        "composition": "Pantoprazole (40mg)",
        "dosage": "40mg",
        "uses": "Acidity, GERD, Heartburn, Gastric ulcer",
        "manufacturer": "Alkem Laboratories Ltd",
        "form": "Tablet",
    },
    {
        "name": "Cetirizine 10mg Tablet",
        "composition": "Cetirizine Hydrochloride (10mg)",
        "dosage": "10mg",
        "uses": "Allergic rhinitis, Runny nose, Sneezing, Urticaria/Itching",
        "manufacturer": "Dr. Reddy's Laboratories",
        "form": "Tablet",
    },
    {
        "name": "Amoxicillin 500mg Capsule",
        "composition": "Amoxicillin (500mg)",
        "dosage": "500mg",
        "uses": "Bacterial infections, Dental infections, Ear infections",
        "manufacturer": "Abbott Healthcare",
        "form": "Capsule",
    },
    {
        "name": "Metformin 500mg Tablet",
        "composition": "Metformin Hydrochloride (500mg)",
        "dosage": "500mg",
        "uses": "Type 2 Diabetes Mellitus, Glycemic control",
        "manufacturer": "USV Ltd",
        "form": "Tablet",
    },
]


def extract_dosage(composition: str, name: str) -> str:
    """Extract a reasonable default dosage/strength string from composition or medicine name."""
    match = re.search(r'\((\d+(?:\.\d+)?\s*(?:mg|mcg|gm|g|ml|%|IU))\)', composition, re.IGNORECASE)
    if match:
        return match.group(1)
    match2 = re.search(r'\b(\d+(?:\.\d+)?\s*(?:mg|mcg|gm|g|ml|IU))\b', name, re.IGNORECASE)
    if match2:
        return match2.group(1)
    return "1 tablet"


class MedicineRepository:
    def __init__(self):
        self._medicines: List[Dict[str, Any]] = []
        self._is_loaded = False

    def _find_csv_file(self) -> Optional[str]:
        candidates = [
            # PreDoc root
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "Medicine_Details.csv")),
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Medicine_Details.csv")),
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "Medicine_Details.csv")),
            os.path.abspath("Medicine_Details.csv"),
            os.path.abspath(os.path.join("..", "Medicine_Details.csv")),
            r"C:\Users\HP\Downloads\PreDoc\PreDoc\Medicine_Details.csv",
        ]
        for path in candidates:
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                return path
        return None

    def load_dataset(self):
        if self._is_loaded and self._medicines:
            return

        all_meds = []
        seen_names = set()

        # 1. Add curated medicines first so they take priority
        for item in CURATED_COMMON_MEDICINES:
            med_dict = {
                "name": item["name"],
                "composition": item["composition"],
                "dosage": item["dosage"],
                "uses": item["uses"],
                "side_effects": "Mild, consult doctor if persistent",
                "manufacturer": item["manufacturer"],
                "image_url": "",
                "is_curated": True,
            }
            all_meds.append(med_dict)
            seen_names.add(item["name"].lower())

        # 2. Load from Medicine_Details.csv
        csv_path = self._find_csv_file()
        if csv_path:
            logger.info("Loading medicine dataset from %s", csv_path)
            try:
                with open(csv_path, mode="r", encoding="utf-8", errors="ignore") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        name = (row.get("Medicine Name") or "").strip()
                        if not name:
                            continue
                        name_lower = name.lower()
                        if name_lower in seen_names:
                            continue

                        comp = (row.get("Composition") or "").strip()
                        uses = (row.get("Uses") or "").strip()
                        side_effects = (row.get("Side_effects") or "").strip()
                        mfg = (row.get("Manufacturer") or "").strip()
                        img = (row.get("Image URL") or "").strip()

                        dosage = extract_dosage(comp, name)

                        all_meds.append({
                            "name": name,
                            "composition": comp,
                            "dosage": dosage,
                            "uses": uses,
                            "side_effects": side_effects,
                            "manufacturer": mfg,
                            "image_url": img,
                            "is_curated": False,
                        })
                        seen_names.add(name_lower)
                logger.info("Successfully loaded %d medicines from dataset", len(all_meds))
            except Exception as e:
                logger.error("Failed to read Medicine_Details.csv: %s", e)
        else:
            logger.warning("Medicine_Details.csv not found in candidate paths; using curated dataset only.")

        self._medicines = all_meds
        self._is_loaded = True

    def search(self, query: str, limit: int = 25) -> List[Dict[str, Any]]:
        """
        Search medicines by name or composition with smart relevance ranking:
        1. Exact prefix match on name (e.g. 'D' matches 'Dolo...', 'Diclo...')
        2. Curated common clinical drugs matching query
        3. Word-level prefix match in name
        4. Substring in name
        5. Composition match (e.g. 'Diclofenac' matches composition)
        """
        if not self._is_loaded:
            self.load_dataset()

        q = query.strip().lower()
        if not q:
            return self._medicines[:limit]

        # Buckets for tiered ranking
        exact_prefix_curated = []
        exact_prefix_other = []
        word_prefix = []
        name_contains = []
        comp_matches = []

        seen = set()

        for med in self._medicines:
            name = med["name"]
            name_lower = name.lower()
            comp_lower = med["composition"].lower()

            if name_lower in seen:
                continue

            # Check exact prefix on name
            if name_lower.startswith(q):
                seen.add(name_lower)
                if med.get("is_curated"):
                    exact_prefix_curated.append(med)
                else:
                    exact_prefix_other.append(med)
                continue

            # Check if any individual word in name starts with q
            words = name_lower.replace("-", " ").replace("/", " ").split()
            if any(w.startswith(q) for w in words):
                seen.add(name_lower)
                word_prefix.append(med)
                continue

            # Check substring match in name
            if q in name_lower:
                seen.add(name_lower)
                name_contains.append(med)
                continue

            # Check composition (active ingredient prefix or substring)
            comp_words = comp_lower.replace("-", " ").replace("+", " ").replace("(", " ").split()
            if any(w.startswith(q) for w in comp_words) or q in comp_lower:
                seen.add(name_lower)
                comp_matches.append(med)

        # Assemble prioritized results
        combined = (
            exact_prefix_curated
            + exact_prefix_other
            + word_prefix
            + name_contains
            + comp_matches
        )
        return combined[:limit]


# Global singleton instance
medicine_repo = MedicineRepository()
