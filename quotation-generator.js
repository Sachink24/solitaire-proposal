/* ============================================================================
   SOLITAIRE FINZ MART — Sanction Quotation (Processing Fee) Generator
   Drop into SOLITAIRE-Admin-Panel, alongside your existing Sanction Letter
   PDF button in the Sanctions tab. Uses html2pdf.js (already in your stack).
   ============================================================================
   INTEGRATION:
   1. Paste this whole file into admin.html (or its own <script src="...">).
   2. Adjust the FIELD_MAP block below to match your actual column names.
   3. Add a button next to your existing "Sanction Letter" button:
        <button onclick="generateQuotation('LN-1023')">Quotation</button>
      or wire it to read the LN typed into an input:
        <input id="lnInput" placeholder="LN-____">
        <button onclick="generateQuotation(document.getElementById('lnInput').value)">
          Generate Quotation
        </button>
   ========================================================================== */

// ---------------------------------------------------------------------------
// 1. FIELD MAP — tell me/edit here which real columns hold each value.
//    Left side = logical name used below. Right side = your actual column.
//    Update ONLY this block once you confirm your schema; nothing else
//    needs to change.
// ---------------------------------------------------------------------------
const QUOTATION_FIELD_MAP = {
  leads: {
    lnField: "lead_number",        // <-- CONFIRM: column on `leads` holding "LN-____"
                                    //     (fallback below also tries matching on `id`)
    applicantName: "applicant_name",
    applicantAddress: "address",
    applicantPhone: "phone",
    loanType: "loan_type",
    loanAmountFallback: "credit_loan_amount", // used if sanctions.sanction_amount is null
  },
  sanctions: {
    fkToLead: "lead_id",           // foreign key on `sanctions` -> `leads.id`
    sanctionAmount: "sanction_amount",
    banker: "banker",
    tenureMonths: "tenure_months",
    roi: "roi",
    emi: "emi",
    processingFee: "processing_fee",
    insurance: "insurance",
    conditions: "conditions",
    finalRemarks: "final_remarks",
  },
};

// ---------------------------------------------------------------------------
// 2. DATA FETCH — pull the lead + its sanction by LN number.
//    Assumes a global `supabase` client already initialized elsewhere in
//    admin.html (same pattern as your other tabs).
// ---------------------------------------------------------------------------
async function fetchQuotationData(lnNumber) {
  const FM = QUOTATION_FIELD_MAP;
  const cleanLN = String(lnNumber || "").trim();
  if (!cleanLN) throw new Error("Please enter an LN number.");

  // Try matching on the dedicated LN field first (case-insensitive per your .ilike() convention)
  let { data: leadRows, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .ilike(FM.leads.lnField, cleanLN);

  if (leadErr) throw leadErr;

  // Fallback: if nothing found and the input looks like a raw id/number, try leads.id
  if (!leadRows || leadRows.length === 0) {
    const numericPart = cleanLN.replace(/[^0-9]/g, "");
    if (numericPart) {
      const { data: fallbackRows } = await supabase
        .from("leads")
        .select("*")
        .eq("id", numericPart);
      leadRows = fallbackRows;
    }
  }

  if (!leadRows || leadRows.length === 0) {
    throw new Error(`No lead found for "${cleanLN}". Check the LN number or FIELD_MAP.leads.lnField.`);
  }
  const lead = leadRows[0];

  // Pull the matching sanction record (mixed-case status values -> use ilike where relevant)
  const { data: sanctionRows, error: sancErr } = await supabase
    .from("sanctions")
    .select("*")
    .eq(FM.sanctions.fkToLead, lead.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (sancErr) throw sancErr;
  const sanction = (sanctionRows && sanctionRows[0]) || {};

  return { lead, sanction };
}

// ---------------------------------------------------------------------------
// 3. FORMAT HELPERS
// ---------------------------------------------------------------------------
function formatINR(amount) {
  if (amount === null || amount === undefined || amount === "") return "[Amount]";
  const num = Number(amount);
  if (Number.isNaN(num)) return String(amount);
  return "₹ " + num.toLocaleString("en-IN");
}

function amountInWords(amount) {
  // Lightweight Indian-numbering words converter for the sanction amount.
  const num = Number(amount);
  if (!amount || Number.isNaN(num)) return "[Amount in Words]";
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function two(n) {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
  }
  function three(n) {
    if (n > 99) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + two(n % 100) : "");
    return two(n);
  }
  let n = Math.floor(num);
  if (n === 0) return "Zero";
  let str = "";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const rest = n;
  if (crore) str += three(crore) + " Crore ";
  if (lakh) str += three(lakh) + " Lakh ";
  if (thousand) str += three(thousand) + " Thousand ";
  if (rest) str += three(rest);
  return str.trim();
}

function todayDMY() {
  const d = new Date();
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
}

// ---------------------------------------------------------------------------
// 4. BRANDED HTML TEMPLATE — Diamond Noir styling, mirrors buildBrandedPDF()
// ---------------------------------------------------------------------------
function buildQuotationHTML({ lead, sanction }, lnNumber) {
  const FM = QUOTATION_FIELD_MAP;
  const sanctionAmount = sanction[FM.sanctions.sanctionAmount] ?? lead[FM.leads.loanAmountFallback];

  return `
  <div style="font-family: Georgia, 'Times New Roman', serif; color:#1A1A1A; padding: 28px 34px; max-width: 780px;">
    <div style="text-align:center; margin-bottom:6px;">
      <div style="font-family: Cambria, Georgia, serif; font-size:26px; font-weight:bold; letter-spacing:2px; color:#C9A227;">
        SOLITAIRE FINZ MART
      </div>
      <div style="font-size:11px; color:#555; font-style:italic; margin-top:2px;">
        LOAN DSA &nbsp;•&nbsp; FINANCIAL ADVISORY &nbsp;•&nbsp; ESTABLISHED SINCE 15+ YEARS
      </div>
      <div style="font-size:11px; color:#555; margin-top:2px;">
        Bhiwandi, Thane, Maharashtra, India &nbsp;|&nbsp; [Contact Number] &nbsp;|&nbsp; [Email Address]
      </div>
    </div>
    <div style="border-bottom:2px solid #C9A227; margin: 8px 0 18px;"></div>

    <div style="text-align:right; font-size:12px; margin-bottom:4px;">
      <b>Date:</b> ${todayDMY()}
    </div>
    <div style="text-align:right; font-size:12px; margin-bottom:16px;">
      <b>Ref. No.:</b> SFM/QT/${lnNumber}
    </div>

    <div style="font-size:12px; line-height:1.5; margin-bottom:14px;">
      <b>To,</b><br/>
      ${lead[FM.leads.applicantName] || "[Applicant Name]"}<br/>
      ${lead[FM.leads.applicantAddress] || "[Client Address]"}<br/>
      ${lead[FM.leads.applicantPhone] || "[Client Contact Number]"}
    </div>

    <div style="font-size:12px; margin-bottom:12px;">
      <b>Subject: <u>Quotation towards Sanction of Loan Facility – Request for Processing Fees</u></b>
    </div>

    <div style="font-size:12px; margin-bottom:12px;">Dear Sir / Madam,</div>

    <div style="font-size:12px; line-height:1.6; margin-bottom:14px;">
      With reference to your loan application processed through Solitaire Finz Mart, we are pleased to inform you
      that your proposal has been considered favourably and a Sanction has been arrived at, subject to the terms
      below. Please find the sanction summary and the processing fee payable to enable us to proceed with
      disbursement formalities.
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px;">
      ${row("Applicant Name", lead[FM.leads.applicantName] || "[Applicant Name]")}
      ${row("Loan Type", lead[FM.leads.loanType] || "[Loan Type]")}
      ${row("Bank / NBFC", sanction[FM.sanctions.banker] || "[Lender Name]")}
      ${row("Sanctioned Loan Amount", `${formatINR(sanctionAmount)} (Rupees ${amountInWords(sanctionAmount)} Only)`)}
      ${row("Tenure", sanction[FM.sanctions.tenureMonths] ? sanction[FM.sanctions.tenureMonths] + " Months" : "[__] Months")}
      ${row("Rate of Interest", sanction[FM.sanctions.roi] ? sanction[FM.sanctions.roi] + "% p.a." : "[__]% p.a.")}
      ${row("Processing Fee (Payable to Solitaire Finz Mart)", formatINR(sanction[FM.sanctions.processingFee]) + " + GST as applicable")}
      ${row("Payment Due By", "[DD/MM/YYYY]")}
      ${row("Mode of Payment", "[Bank Transfer / UPI / Cheque] – Details below")}
    </table>

    <div style="font-family:Cambria, Georgia, serif; font-weight:bold; color:#C9A227; font-size:15px; margin-bottom:4px;">
      Mutual Understanding
    </div>
    <div style="border-bottom:1px solid #C4A672; margin-bottom:10px;"></div>
    <div style="font-size:12px; line-height:1.6; margin-bottom:10px;">
      This quotation is issued on the basis of a mutual understanding between the Applicant/Client and Solitaire
      Finz Mart that the above processing fee is payable towards the professional services rendered by Solitaire
      Finz Mart in sourcing, processing, coordinating, and following up on the loan file with the concerned
      Bank/NBFC until final disbursement, irrespective of the outcome of the final disbursement, unless otherwise
      agreed in writing.
    </div>
    <div style="font-size:12px; line-height:1.6; margin-bottom:16px;">
      Both parties agree to act in good faith, and any change in sanction terms, loan amount, or fee structure by
      the Bank/NBFC shall be communicated promptly and shall be governed by mutual consent between the Client and
      Solitaire Finz Mart.
    </div>

    <div style="font-family:Cambria, Georgia, serif; font-weight:bold; color:#C9A227; font-size:15px; margin-bottom:4px;">
      General Terms &amp; Conditions
    </div>
    <div style="border-bottom:1px solid #C4A672; margin-bottom:10px;"></div>
    <ol style="font-size:12px; line-height:1.6; padding-left:18px; margin-bottom:16px;">
      <li>The processing fee quoted above is exclusive of any charges levied directly by the Bank/NBFC (login fee, legal/technical charges, stamp duty, CERSAI, insurance, etc.), which shall be borne separately by the Client.</li>
      <li>The processing fee, once paid, is non-refundable, except where the loan proposal is rejected solely due to a documentation error attributable to Solitaire Finz Mart, in which case refund shall be as mutually agreed.</li>
      <li>Final loan sanction, disbursement amount, rate of interest, and tenure remain at the sole discretion of the sanctioning Bank/NBFC and may vary from the indicative terms mentioned herein.</li>
      <li>The Client shall submit all requisite KYC, income, property, and other documents as required by the Bank/NBFC in a timely manner to avoid delays in processing.</li>
      <li>Solitaire Finz Mart acts purely as a facilitator/DSA between the Client and the Bank/NBFC and shall not be held liable for any delay, rejection, or change in terms made by the lending institution.</li>
      <li>Any statutory taxes (including GST) applicable on the processing fee shall be charged additionally as per prevailing rates.</li>
      <li>This quotation is valid for a period of [__] days from the date of issue, post which the terms are subject to revalidation.</li>
      <li>Any dispute arising out of this quotation shall be subject to the jurisdiction of courts at Thane, Maharashtra.</li>
      <li>This quotation is confidential and intended solely for the named Applicant/Client.</li>
    </ol>

    <div style="font-size:12px; margin-bottom:14px;">
      Kindly confirm your acceptance of the above by signing and returning a copy of this letter, along with
      remittance of the processing fee, to enable us to proceed further on your loan file.
    </div>
    <div style="font-size:12px; margin-bottom:14px;">Thanking you and assuring you of our best services always.</div>
    <div style="font-size:12px; margin-bottom:40px;">For Solitaire Finz Mart,</div>

    <div style="font-size:13px; font-weight:bold;">Sachin Shivaji Kale</div>
    <div style="font-size:12px; font-style:italic; color:#555;">Managing Partner</div>
    <div style="font-size:12px; margin-bottom:20px;">Solitaire Finz Mart</div>

    <div style="font-family:Cambria, Georgia, serif; font-weight:bold; color:#C9A227; font-size:15px; margin-bottom:4px;">
      Client Acceptance
    </div>
    <div style="border-bottom:1px solid #C4A672; margin-bottom:10px;"></div>
    <div style="font-size:12px; margin-bottom:20px;">I/We accept the above quotation and terms &amp; conditions.</div>
    <div style="font-size:12px; margin-bottom:8px;">Signature: ____________________________</div>
    <div style="font-size:12px; margin-bottom:8px;">Name: ____________________________</div>
    <div style="font-size:12px;">Date: ____________________________</div>

    <div style="border-top:1px solid #C9A227; margin-top:24px; padding-top:6px; text-align:center; font-size:10px; font-style:italic; color:#555;">
      Solitaire Finz Mart | Home Loans · Business Loans · LAP · Balance Transfer · Construction &amp; Project Finance
    </div>
  </div>`;

  function row(k, v) {
    return `<tr>
      <td style="background:#F5EFDD; border:1px solid #ddd; padding:6px 10px; width:38%; font-weight:bold;">${k}</td>
      <td style="border:1px solid #ddd; padding:6px 10px;">${v}</td>
    </tr>`;
  }
}

// ---------------------------------------------------------------------------
// 5. MAIN ENTRY POINT — call this from your "Quotation" button
// ---------------------------------------------------------------------------
async function generateQuotation(lnNumber) {
  try {
    const data = await fetchQuotationData(lnNumber);
    const html = buildQuotationHTML(data, lnNumber);

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // Matches your existing PDF pipeline (html2pdf.js)
    await html2pdf()
      .set({
        margin: 0,
        filename: `Quotation_${lnNumber}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "pt", format: "letter", orientation: "portrait" },
      })
      .from(container)
      .save();

    document.body.removeChild(container);
  } catch (err) {
    console.error(err);
    alert("Could not generate quotation: " + err.message);
  }
}
