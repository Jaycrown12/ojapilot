"""
AI Copilot Service for OJAPILOT.
Provides fast, practical natural-language parsing of sales and inventory notes.
Combines Gemini LLM reasoning with a reliable, deterministic retail-matching fallback
engine so that parse requests never fail during demos or network hiccups.
"""
import logging
import re
import uuid
from typing import Dict, List, Optional, Tuple

from app.schemas.copilot import CopilotParseResponse, ParsedItem
from app.schemas.sale import SaleCreate, SaleItemCreate

logger = logging.getLogger(__name__)

# Common English and Pidgin/Nigerian English number words
NUMBER_WORDS: Dict[str, int] = {
    "a": 1,
    "an": 1,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "dozen": 12,
    "half dozen": 6,
}

# Common synonym mappings for grocery / retail
SYNONYMS: Dict[str, str] = {
    "coke": "coca cola",
    "fanta": "fanta",
    "sprite": "sprite",
    "indomie": "noodles",
    "milo": "nestle milo",
    "garri": "gari",
    "beans": "beans",
    "eggs": "egg",
}

# Filler verbs and phrases in retail notes
FILLER_PATTERNS = [
    r"\bsold\b",
    r"\bsell\b",
    r"\bbought\b",
    r"\bbuy\b",
    r"\bcustomer paid for\b",
    r"\bcustomer bought\b",
    r"\bcustomer take\b",
    r"\brecord\b",
    r"\brecorded\b",
    r"\bgive\b",
    r"\bpieces of\b",
    r"\bpcs of\b",
    r"\btins of\b",
    r"\bcartons of\b",
    r"\bbags of\b",
    r"\bpackets of\b",
    r"\bbottles of\b",
    r"\bcrates of\b",
    r"\bunits of\b",
    r"\bpcs\b",
    r"\btins\b",
    r"\bcartons\b",
    r"\bbags\b",
    r"\bwith\b",
    r"\bfor\b",
    r"\bcash\b",
    r"\btransfer\b",
    r"\bpos\b",
]


def extract_discount(text: str) -> Tuple[float, str]:
    """
    Extracts discount amount from natural text and returns (discount_value, cleaned_text).
    Supports e.g. 'discount of 500', '500 discount', 'less 200', 'minus 300 naira'.
    """
    discount = 0.0
    cleaned = text

    patterns = [
        r"(?:discount|less|off|minus)\s*(?:of\s*)?(?:₦|ngn)?\s*(\d+(?:\.\d+)?)",
        r"(?:₦|ngn)?\s*(\d+(?:\.\d+)?)\s*(?:discount|less|off)",
    ]

    for pat in patterns:
        match = re.search(pat, cleaned, re.IGNORECASE)
        if match:
            try:
                discount = float(match.group(1))
                cleaned = cleaned[:match.start()] + " " + cleaned[match.end():]
                break
            except (ValueError, IndexError):
                pass

    return discount, cleaned.strip()


def extract_customer_name(text: str) -> Tuple[Optional[str], str]:
    """
    Extracts customer name from retail notes.
    e.g. 'Mama Tunde bought 2 Peak milk', 'Sold 2 milk to John Doe', 'Customer Emeka bought 3 bread'.
    Returns (customer_name, cleaned_text).
    """
    cleaned = text
    customer = None

    # 1. Titled names like Mama Tunde, Baba Segun, Iya Moria, Alhaji Musa, Mr Johnson, Sister Mary
    title_match = re.search(
        r"\b((?:Mama|Baba|Iya|Alhaji|Chief|Mr\.?|Mrs\.?|Brother|Sister)\s+[A-Za-z]+)\b",
        cleaned,
        re.IGNORECASE,
    )
    if title_match:
        customer = title_match.group(1).strip()
        cleaned = cleaned[:title_match.start()] + " " + cleaned[title_match.end():]
        return customer, re.sub(r"\s+", " ", cleaned).strip()

    # 2. Leading names before action verbs: e.g. "John bought...", "Emeka collected...", "Customer Sarah took..."
    lead_match = re.search(
        r"^(?:customer\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?=(?:bought|take|took|paid|owes?|picked(?:\s+up)?|collected|ordered)\b)",
        cleaned,
        re.IGNORECASE,
    )
    if lead_match:
        cand = lead_match.group(1).strip()
        if cand.lower() not in ["customer", "someone", "sold", "record", "we", "i", "he", "she"]:
            customer = cand.title()
            cleaned = cleaned[lead_match.end():]
            return customer, re.sub(r"\s+", " ", cleaned).strip()

    # 3. "... to [Name]" or "... for [Name]"
    to_match = re.search(r"\b(?:to|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b", cleaned, re.IGNORECASE)
    if to_match:
        cand = to_match.group(1).strip()
        if cand.lower() not in ["credit", "cash", "pos", "transfer", "debt", "now", "later"]:
            customer = cand.title()
            cleaned = cleaned[:to_match.start()] + " " + cleaned[to_match.end():]
            return customer, re.sub(r"\s+", " ", cleaned).strip()

    return None, cleaned.strip()


def extract_credit_and_payment_hints(text: str) -> Tuple[Optional[float], Optional[float], bool, str]:
    """
    Pre-scans the text for credit, owing, or partial payment phrases and returns:
    (explicit_owing, explicit_paid, is_full_credit, cleaned_text)
    """
    cleaned = text
    explicit_owing = None
    explicit_paid = None
    is_full_credit = False

    # 1. Full credit phrases: 'on credit', 'for credit', 'credit sale', 'on debt'
    credit_match = re.search(r"\b(?:on\s+credit|for\s+credit|credit\s+sale|on\s+debt)\b", cleaned, re.IGNORECASE)
    if credit_match:
        is_full_credit = True
        cleaned = cleaned[:credit_match.start()] + " " + cleaned[credit_match.end():]

    # 2. Explicit owing / balance phrases: 'owing me 500', 'balance 500', 'owe 500', 'debt of 500'
    owing_patterns = [
        r"(?:owing(?:\s+me)?|owes?|balance(?:\s+due)?(?:\s+of)?|remaining|debt(?:\s+of)?|remains)\s*(?:₦|ngn)?\s*(\d+(?:\.\d+)?)",
        r"(?:₦|ngn)?\s*(\d+(?:\.\d+)?)\s*(?:owing|balance|debt|remaining)",
    ]
    for pat in owing_patterns:
        m = re.search(pat, cleaned, re.IGNORECASE)
        if m:
            try:
                explicit_owing = float(m.group(1))
                cleaned = cleaned[:m.start()] + " " + cleaned[m.end():]
                break
            except (ValueError, IndexError):
                pass

    # 3. Explicit paid / deposit phrases: 'paid 2000', 'deposit 2000', 'advance 2000'
    paid_patterns = [
        r"(?:paid(?:\s+me)?|pays?|deposit(?:\s+of)?|advance(?:\s+of)?|down\s*payment(?:\s+of)?)\s*(?:₦|ngn)?\s*(\d+(?:\.\d+)?)",
        r"(?:₦|ngn)?\s*(\d+(?:\.\d+)?)\s*(?:paid|deposit|advance)",
    ]
    for pat in paid_patterns:
        m = re.search(pat, cleaned, re.IGNORECASE)
        if m:
            try:
                explicit_paid = float(m.group(1))
                cleaned = cleaned[:m.start()] + " " + cleaned[m.end():]
                break
            except (ValueError, IndexError):
                pass

    return explicit_owing, explicit_paid, is_full_credit, re.sub(r"\s+", " ", cleaned).strip()


def normalize_words(text: str) -> str:
    """Normalizes word numbers (e.g. 'two' -> '2') and cleans noise characters."""
    tokens = text.lower().split()
    normalized = []
    for tok in tokens:
        clean_tok = re.sub(r"[^\w]", "", tok)
        if clean_tok in NUMBER_WORDS:
            normalized.append(str(NUMBER_WORDS[clean_tok]))
        else:
            normalized.append(tok)
    return " ".join(normalized)


def match_product_in_clause(
    clause: str,
    products: List[dict]
) -> Optional[Tuple[dict, int, Optional[float], float]]:
    """
    Matches a single clause against catalog products.
    Returns (matched_product, quantity, unit_price_override, match_score) or None.
    """
    clean_clause = clause.lower()

    # Extract price override e.g. '@ 1200' or 'at 1500 each' or 'for ₦1200'
    price_override = None
    price_match = re.search(r"(?:@|at)\s*(?:₦|ngn)?\s*(\d+(?:\.\d+)?)|(?:for)\s*(?:₦|ngn)\s*(\d+(?:\.\d+)?)", clean_clause)
    if price_match:
        try:
            val = price_match.group(1) or price_match.group(2)
            price_override = float(val)
            clean_clause = clean_clause[:price_match.start()] + " " + clean_clause[price_match.end():]
        except (ValueError, IndexError):
            pass

    # Extract quantity
    qty = 1
    # Check for leading number e.g. "2 peak milk"
    qty_match = re.search(r"\b(\d+)\b", clean_clause)
    if qty_match:
        try:
            parsed_qty = int(qty_match.group(1))
            if parsed_qty > 0 and parsed_qty < 10000:
                qty = parsed_qty
                # Remove quantity from clause text for better product name matching
                clean_clause = clean_clause[:qty_match.start()] + " " + clean_clause[qty_match.end():]
        except (ValueError, IndexError):
            pass

    # Clean filler words
    for pat in FILLER_PATTERNS:
        clean_clause = re.sub(pat, " ", clean_clause, flags=re.IGNORECASE)
    clean_clause = re.sub(r"\s+", " ", clean_clause).strip()

    clause_tokens = set(re.findall(r"\w+", clean_clause))
    if not clause_tokens:
        return None

    expanded_clause_tokens = set(clause_tokens)
    for tok in list(clause_tokens):
        if tok in SYNONYMS:
            expanded_clause_tokens.update(re.findall(r"\w+", SYNONYMS[tok]))

    best_match = None
    highest_score = 0.0

    # Sort products so longer specific names take priority
    sorted_products = sorted(products, key=lambda p: len(p.get("name", "")), reverse=True)

    for p in sorted_products:
        p_name = p.get("name", "").lower()
        p_sku = p.get("sku", "").lower()

        # Direct SKU match
        if p_sku and p_sku in clause_tokens:
            return (p, qty, price_override, 1.0)

        # Direct exact or substring name match
        clean_p_name = re.sub(r"[^\w\s]", "", p_name).strip()
        if clean_p_name and clean_p_name in clean_clause:
            score = 0.95 + (len(clean_p_name) / 1000.0)
            if score > highest_score:
                highest_score = score
                best_match = p
            continue

        # Word token overlap match
        p_tokens = set(re.findall(r"\w+", p_name))
        meaningful_p_tokens = {t for t in p_tokens if len(t) > 2 and not t.isdigit()}
        if not meaningful_p_tokens:
            meaningful_p_tokens = p_tokens

        overlap = expanded_clause_tokens.intersection(meaningful_p_tokens)
        if overlap:
            # Score: baseline for matching distinctive product keywords + proportion
            score = 0.65 + (len(overlap) / float(len(meaningful_p_tokens))) * 0.3
            if score > highest_score and score >= 0.5:
                highest_score = score
                best_match = p

    if best_match and highest_score >= 0.5:
        return (best_match, qty, price_override, highest_score)

    return None


def parse_sale_deterministic(
    note: str,
    products: List[dict],
    business_id: str
) -> CopilotParseResponse:
    """
    Deterministic rule-based NLP parser.
    Splits retail text, extracts quantities/discounts, credit/partial payments, customer names,
    and matches catalog products. Runs in <5ms, never fails, and requires zero external network calls.
    """
    proposal_id = str(uuid.uuid4())
    customer_name, cleaned_note = extract_customer_name(note)
    explicit_owing, explicit_paid, is_full_credit, cleaned_note = extract_credit_and_payment_hints(cleaned_note)
    discount, cleaned_note = extract_discount(cleaned_note)
    normalized = normalize_words(cleaned_note)

    # Split into clauses by punctuation and conjunctions
    raw_clauses = re.split(r"[,;\n\+]|\band\b|&", normalized, flags=re.IGNORECASE)
    clauses = [c.strip() for c in raw_clauses if c.strip()]

    matched_items: List[ParsedItem] = []
    matched_product_ids = set()
    unmatched_clauses: List[str] = []

    for clause in clauses:
        match_result = match_product_in_clause(clause, products)
        if match_result:
            product, qty, price_override, _ = match_result
            if product["id"] in matched_product_ids:
                # Merge quantities if product was mentioned twice
                for item in matched_items:
                    if item.product_id == product["id"]:
                        item.quantity += qty
                        item.line_total = round(item.quantity * item.unit_price, 2)
                        break
            else:
                unit_price = price_override if price_override is not None else float(product["selling_price"])
                line_total = round(qty * unit_price, 2)
                matched_items.append(
                    ParsedItem(
                        product_id=product["id"],
                        product_name=product["name"],
                        quantity=qty,
                        unit_price=unit_price,
                        line_total=line_total,
                        available_stock=int(product.get("stock_qty", 0)),
                        matched_text=clause,
                    )
                )
                matched_product_ids.add(product["id"])
        else:
            if len(clause) > 2:
                unmatched_clauses.append(clause)

    # If clause-splitting missed, fallback to whole-text product search
    if not matched_items and products:
        for p in sorted(products, key=lambda x: len(x.get("name", "")), reverse=True):
            p_name = p.get("name", "").lower()
            if p_name in normalized:
                unit_price = float(p["selling_price"])
                matched_items.append(
                    ParsedItem(
                        product_id=p["id"],
                        product_name=p["name"],
                        quantity=1,
                        unit_price=unit_price,
                        line_total=unit_price,
                        available_stock=int(p.get("stock_qty", 0)),
                        matched_text=p["name"],
                    )
                )
                break

    subtotal = round(sum(it.line_total for it in matched_items), 2)
    discount = round(min(discount, subtotal), 2)
    total_amount = round(max(0.0, subtotal - discount), 2)

    # Determine credit / partial payment amounts
    if is_full_credit:
        balance_due = total_amount
        amount_paid = 0.0
        payment_status = "credit"
    elif explicit_owing is not None:
        balance_due = min(explicit_owing, total_amount)
        amount_paid = max(0.0, round(total_amount - balance_due, 2))
        payment_status = "credit" if amount_paid <= 0.0 else "partial"
    elif explicit_paid is not None:
        amount_paid = min(explicit_paid, total_amount)
        balance_due = max(0.0, round(total_amount - amount_paid, 2))
        payment_status = "paid" if balance_due <= 0.0 else ("credit" if amount_paid <= 0.0 else "partial")
    else:
        amount_paid = total_amount
        balance_due = 0.0
        payment_status = "paid"

    # Build human explanation & summary
    if matched_items:
        items_summary = ", ".join(f"{it.quantity}x {it.product_name} (₦{it.unit_price:,.2f})" for it in matched_items)
        prefix = f"Customer: {customer_name}. " if customer_name else ""
        explanation = f"{prefix}Matched {len(matched_items)} item(s): {items_summary}."
        if discount > 0:
            explanation += f" Applied ₦{discount:,.2f} discount."
        explanation += f" Total: ₦{total_amount:,.2f}."
        if balance_due > 0:
            explanation += f" Paid: ₦{amount_paid:,.2f}, Balance Owed: ₦{balance_due:,.2f}."
            if customer_name:
                summary = f"Sale for {customer_name}: ₦{total_amount:,.2f} (Owing ₦{balance_due:,.2f})"
            else:
                summary = f"Sale of {len(matched_items)} item(s) for ₦{total_amount:,.2f} (Owing ₦{balance_due:,.2f})"
        else:
            summary = f"Sale of {len(matched_items)} item(s) for ₦{total_amount:,.2f}"
            if customer_name:
                summary = f"Sale for {customer_name}: ₦{total_amount:,.2f}"
    else:
        explanation = "Could not find matching products in catalog. Please check product names or add items first."
        summary = "No catalog products matched"

    # Generate ready-to-execute idempotency key and SaleCreate payload if items matched
    suggested_payload = None
    if matched_items:
        idempotency_key = str(uuid.uuid4())
        suggested_payload = SaleCreate(
            business_id=business_id,
            customer_id=None,
            customer_name=customer_name,
            idempotency_key=idempotency_key,
            items=[
                SaleItemCreate(
                    product_id=it.product_id,
                    quantity=it.quantity,
                    unit_price=it.unit_price,
                )
                for it in matched_items
            ],
            discount=discount,
            amount_paid=amount_paid,
            balance_due=balance_due,
            payment_status=payment_status,
        )

    return CopilotParseResponse(
        proposal_id=proposal_id,
        business_id=business_id,
        note=note,
        summary=summary,
        customer_name=customer_name,
        items=matched_items,
        subtotal=subtotal,
        discount=discount,
        total_amount=total_amount,
        amount_paid=amount_paid,
        balance_due=balance_due,
        payment_status=payment_status,
        unmatched_tokens=unmatched_clauses,
        explanation=explanation,
        source="deterministic_engine",
        suggested_payload=suggested_payload,
    )


def parse_sale_with_copilot(
    note: str,
    products: List[dict],
    business_id: str,
    gemini_api_key: Optional[str] = None
) -> CopilotParseResponse:
    """
    Main entry point for AI Copilot sales note parsing.
    Attempts Gemini LLM parsing if configured; smoothly falls back to the deterministic
    engine if the LLM key is absent, fails, or network is unavailable.
    """
    # 1. Deterministic baseline (guaranteed fast and reliable)
    baseline = parse_sale_deterministic(note, products, business_id)

    # 2. If no products in business, return baseline immediately
    if not products:
        return baseline

    # 3. If Gemini API key is configured, attempt intelligent enhancement
    if gemini_api_key and gemini_api_key.strip():
        try:
            import concurrent.futures
            import json
            from google import genai

            client = genai.Client(api_key=gemini_api_key.strip())

            # Compact catalog prompt representation
            catalog_repr = [
                {"id": p["id"], "name": p["name"], "price": float(p["selling_price"]), "stock": int(p.get("stock_qty", 0))}
                for p in products[:50]
            ]

            prompt = (
                f"You are the OjaPilot SME Sales Copilot. Parse the following natural-language store note "
                f"and map it strictly to the products in the catalog.\n\n"
                f"Catalog: {json.dumps(catalog_repr)}\n\n"
                f"Store Note: \"{note}\"\n\n"
                f"Detect customer name and credit/partial payment amounts if mentioned.\n"
                f"Return ONLY valid JSON matching this exact structure:\n"
                f"{{\n"
                f'  "customer_name": "Optional customer name or null",\n'
                f'  "items": [{{"product_id": "UUID", "quantity": 1, "unit_price": 1000.0}}],\n'
                f'  "discount": 0.0,\n'
                f'  "amount_paid": null,\n'
                f'  "balance_due": null,\n'
                f'  "payment_status": "paid",\n'
                f'  "summary": "Short plain English summary"\n'
                f"}}"
            )

            def _call_gemini():
                # Attempt gemini-2.5-flash or gemini-3.8-flash
                return client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt,
                )

            # Enforce hard 1.2-second timeout to avoid tenacity retry hangs
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            try:
                future = executor.submit(_call_gemini)
                response = future.result(timeout=1.2)
            finally:
                executor.shutdown(wait=False)

            if response and response.text:
                raw_text = response.text.strip()
                # Extract JSON block
                json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
                if json_match:
                    parsed_json = json.loads(json_match.group(0))
                    llm_items = parsed_json.get("items", [])
                    llm_discount = float(parsed_json.get("discount", 0.0))
                    customer_name = parsed_json.get("customer_name") or baseline.customer_name

                    prod_map = {p["id"]: p for p in products}
                    valid_items: List[ParsedItem] = []

                    for it in llm_items:
                        pid = it.get("product_id")
                        if pid in prod_map:
                            prod = prod_map[pid]
                            qty = max(1, int(it.get("quantity", 1)))
                            u_price = float(it.get("unit_price", prod["selling_price"]))
                            valid_items.append(
                                ParsedItem(
                                    product_id=pid,
                                    product_name=prod["name"],
                                    quantity=qty,
                                    unit_price=u_price,
                                    line_total=round(qty * u_price, 2),
                                    available_stock=int(prod.get("stock_qty", 0)),
                                    matched_text=prod["name"],
                                )
                            )

                    if valid_items:
                        subtotal = round(sum(it.line_total for it in valid_items), 2)
                        discount = round(min(llm_discount, subtotal), 2)
                        total_amount = round(max(0.0, subtotal - discount), 2)

                        # Determine amount_paid, balance_due, and payment_status
                        llm_balance = parsed_json.get("balance_due")
                        llm_paid = parsed_json.get("amount_paid")
                        if llm_balance is not None:
                            balance_due = min(float(llm_balance), total_amount)
                            amount_paid = max(0.0, round(total_amount - balance_due, 2))
                            payment_status = "credit" if amount_paid <= 0.0 else "partial"
                        elif llm_paid is not None:
                            amount_paid = min(float(llm_paid), total_amount)
                            balance_due = max(0.0, round(total_amount - amount_paid, 2))
                            payment_status = "paid" if balance_due <= 0.0 else ("credit" if amount_paid <= 0.0 else "partial")
                        else:
                            balance_due = baseline.balance_due
                            amount_paid = baseline.amount_paid
                            payment_status = baseline.payment_status

                        summary = parsed_json.get("summary")
                        if not summary:
                            if balance_due > 0:
                                summary = f"Sale for {customer_name}: ₦{total_amount:,.2f} (Owing ₦{balance_due:,.2f})" if customer_name else f"Sale of {len(valid_items)} item(s) for ₦{total_amount:,.2f} (Owing ₦{balance_due:,.2f})"
                            else:
                                summary = f"Sale of {len(valid_items)} item(s) for ₦{total_amount:,.2f}"

                        idempotency_key = str(uuid.uuid4())
                        suggested_payload = SaleCreate(
                            business_id=business_id,
                            customer_id=None,
                            customer_name=customer_name,
                            idempotency_key=idempotency_key,
                            items=[
                                SaleItemCreate(
                                    product_id=it.product_id,
                                    quantity=it.quantity,
                                    unit_price=it.unit_price,
                                )
                                for it in valid_items
                            ],
                            discount=discount,
                            amount_paid=amount_paid,
                            balance_due=balance_due,
                            payment_status=payment_status,
                        )

                        items_summary = ", ".join(f"{it.quantity}x {it.product_name}" for it in valid_items)
                        explanation = f"AI Copilot identified: {items_summary}. Total: ₦{total_amount:,.2f}."
                        if customer_name:
                            explanation = f"Customer: {customer_name}. {explanation}"
                        if balance_due > 0:
                            explanation += f" (Paid: ₦{amount_paid:,.2f}, Balance Owed: ₦{balance_due:,.2f})."

                        return CopilotParseResponse(
                            proposal_id=str(uuid.uuid4()),
                            business_id=business_id,
                            note=note,
                            summary=summary,
                            customer_name=customer_name,
                            items=valid_items,
                            subtotal=subtotal,
                            discount=discount,
                            total_amount=total_amount,
                            amount_paid=amount_paid,
                            balance_due=balance_due,
                            payment_status=payment_status,
                            unmatched_tokens=[],
                            explanation=explanation,
                            source="llm",
                            suggested_payload=suggested_payload,
                        )
        except Exception as e:
            logger.info(f"LLM parsing bypassed ({e}). Using deterministic engine.")

    # Return reliable deterministic baseline
    return baseline
