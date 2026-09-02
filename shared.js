/* ============================================================================
   SOLITAIRE — Shared helpers for Quotation & Invoice generators
   Depends on supabase-config.js + auth-guard.js already being loaded
   (same files used by admin.html / credit.html / legal.html / technical.html
   in the SOLITAIRE-Legal-Technical-Credit repo). This file assumes
   window.SolitaireDB.sb is the authenticated Supabase client.
   ========================================================================== */

const SFM = (function () {

  /* ---------------------------------------------------------------------
     LN NUMBER PARSING
     LN numbers are NOT a stored column — admin.html builds them on the fly
     as "LN-" + leads.id (see renderCaseTable in admin.html). So "LN-104",
     "ln104", "104" all resolve to leads.id = 104.
     --------------------------------------------------------------------- */
  function parseLeadId(input) {
    const clean = String(input || "").trim();
    if (!clean) return null;
    const numeric = clean.replace(/[^0-9]/g, "");
    if (!numeric) return null;
    return Number(numeric);
  }

  function lnLabel(id) {
    return "LN-" + id;
  }

  /* ---------------------------------------------------------------------
     DATA FETCH — pulls the lead + its latest sanction record.
     Schema confirmed from admin.html:
       leads: id, borrower(jsonb: name, mobile, location, pincode, email),
              co_applicants(jsonb), property(jsonb: address, city, state, pincode),
              loan_type, loan_amount, institution_name, stage, status,
              credit_loan_amount, credit_term_months, credit_roi,
              credit_fees, credit_conditions
       sanctions: lead_id (unique, FK), application_no, sanction_amount,
              tenure_months, roi, emi, processing_fee, insurance, banker,
              sanction_reference_no, sanction_date, final_remarks, status,
              approved_by, approved_at
     --------------------------------------------------------------------- */
  async function fetchLeadBundle(leadIdOrLN) {
    const sb = window.SolitaireDB && window.SolitaireDB.sb;
    if (!sb) throw new Error("Not connected — supabase-config.js / auth-guard.js not loaded.");

    const leadId = parseLeadId(leadIdOrLN);
    if (!leadId) throw new Error("Enter a valid LN number, e.g. LN-104.");

    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();

    if (leadErr) throw leadErr;
    if (!lead) throw new Error(`No case found for ${lnLabel(leadId)}.`);

    const { data: sanctionRows, error: sancErr } = await sb
      .from("sanctions")
      .select("*")
      .eq("lead_id", leadId)
      .order("approved_at", { ascending: false })
      .limit(1);

    if (sancErr) throw sancErr;
    const sanction = (sanctionRows && sanctionRows[0]) || null;

    return { lead, sanction, leadId };
  }

  /* ---------------------------------------------------------------------
     FORMAT HELPERS
     --------------------------------------------------------------------- */
  function esc(s) {
    return (s == null ? "" : s + "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function formatINR(amount) {
    if (amount === null || amount === undefined || amount === "") return "[Amount]";
    const num = Number(amount);
    if (Number.isNaN(num)) return String(amount);
    return "₹ " + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function amountInWords(amount) {
    const num = Number(amount);
    if (!amount || Number.isNaN(num)) return "[Amount in Words]";
    const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
      "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    function two(n) { return n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : ""); }
    function three(n) { return n > 99 ? a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + two(n % 100) : "") : two(n); }
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

  function fmtDMY(dateStr) {
    if (!dateStr) return todayDMY();
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }

  function borrowerAddress(lead) {
    const b = (lead && lead.borrower) || {};
    const parts = [b.location, b.pincode].filter(Boolean);
    return parts.join(" - ") || "[Client Address]";
  }

  /* ---------------------------------------------------------------------
     PDF EXPORT — shared branded-letterhead → PDF pipeline. Uses standalone
     html2canvas + jsPDF globals loaded by quotation.html/invoice.html.
     --------------------------------------------------------------------- */
  async function exportHTMLToPDF(html, filename) {
    if (typeof window.html2canvas !== "function") {
      throw new Error("html2canvas failed to load. Please refresh the page and try again.");
    }
    if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") {
      throw new Error("jsPDF failed to load. Please refresh the page and try again.");
    }

    // Render fully on-screen (not off-canvas at left:-9999px) — some browsers
    // skip layout/paint for elements positioned far outside the viewport,
    // which produces a blank canvas even though the download still "succeeds".
    // Covered by an opaque white overlay so it doesn't look broken.
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "99998";
    overlay.style.background = "#ffffff";

    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.zIndex = "99999";
    container.style.background = "#ffffff";
    container.style.width = "780px";
    container.innerHTML = html;

    document.body.appendChild(overlay);
    document.body.appendChild(container);

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await window.html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: container.scrollWidth,
        windowHeight: container.scrollHeight,
      });

      if (!canvas || !canvas.width || !canvas.height) {
        throw new Error("Render came back empty (0×0 canvas) — nothing to put in the PDF. Try again after a full page refresh.");
      }

      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      if (!imgData || imgData.length < 1000) {
        throw new Error("Captured image was empty. Try again after a full page refresh.");
      }

      const pdf = new window.jspdf.jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(filename);
    } finally {
      document.body.removeChild(container);
      document.body.removeChild(overlay);
    }
  }

  /* ---------------------------------------------------------------------
     BRANDED LETTERHEAD (shared header/footer used by both documents)
     --------------------------------------------------------------------- */
  function letterheadOpen(refLabel, refValue) {
    return `
    <div style="font-family: Georgia, 'Times New Roman', serif; color:#1A1A1A; padding: 30px 36px; max-width: 780px; background:#fff;">
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
      <div style="text-align:right; font-size:12px; margin-bottom:4px;"><b>Date:</b> ${todayDMY()}</div>
      <div style="text-align:right; font-size:12px; margin-bottom:16px;"><b>${esc(refLabel)}:</b> ${esc(refValue)}</div>`;
  }

  function letterheadClose(footerNote) {
    return `
      <div style="border-top:1px solid #C9A227; margin-top:24px; padding-top:6px; text-align:center; font-size:10px; font-style:italic; color:#555;">
        ${esc(footerNote || "Solitaire Finz Mart | Home Loans · Business Loans · LAP · Balance Transfer · Construction & Project Finance")}
      </div>
    </div>`;
  }

  function row(k, v) {
    return `<tr>
      <td style="background:#F5EFDD; border:1px solid #ddd; padding:6px 10px; width:38%; font-weight:bold;">${esc(k)}</td>
      <td style="border:1px solid #ddd; padding:6px 10px;">${v}</td>
    </tr>`;
  }

  return {
    parseLeadId, lnLabel, fetchLeadBundle, esc, formatINR, amountInWords,
    todayDMY, fmtDMY, borrowerAddress, exportHTMLToPDF,
    letterheadOpen, letterheadClose, row,
  };
})();
