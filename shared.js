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
     EVALUATION REPORT FETCH — Legal / Technical / Credit reports live in
     one shared table, differentiated by report_type. Schema confirmed live
     from Supabase (project nbpvamrwzqrgoiwpadwc):
       evaluation_reports: id, report_type ('legal'|'technical'|'credit'),
         lead_id (FK), loan_app_no, status, data (jsonb — see field maps in
         each report page), signature_path, submitted_by, submitted_at,
         approved_by, approved_at, version
     Pulls the latest row (highest version, then most recent submission) for
     a given lead + report type.
     --------------------------------------------------------------------- */
  async function fetchEvaluationReport(leadId, reportType) {
    const sb = window.SolitaireDB && window.SolitaireDB.sb;
    if (!sb) throw new Error("Not connected — supabase-config.js / auth-guard.js not loaded.");

    const { data: rows, error } = await sb
      .from("evaluation_reports")
      .select("*")
      .eq("lead_id", leadId)
      .eq("report_type", reportType)
      .order("version", { ascending: false })
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) throw error;
    return (rows && rows[0]) || null;
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

  /* Collateral/property address — used on the Sanction Letter, distinct
     from the applicant's own address above. Falls back to the evaluation
     report's free-text propertyAddress if lead.property isn't filled in. */
  function collateralAddress(lead, reportData) {
    const p = (lead && lead.property) || {};
    const fromLead = [p.address, p.city, p.state, p.pincode].filter(Boolean).join(", ");
    if (fromLead) return fromLead;
    if (reportData && reportData.propertyAddress) return reportData.propertyAddress;
    return "[Collateral / Property Address]";
  }

  /* Pulls a value out of an evaluation_report's `data` jsonb blob, with a
     fallback chain (some reports store the same fact under a couple of
     historical key names). Returns "" (not a placeholder) so callers can
     decide how to render a blank — use dv() below when you want the
     bracketed placeholder instead. */
  function pick(data, ...keys) {
    const d = data || {};
    for (const k of keys) {
      if (d[k] !== undefined && d[k] !== null && d[k] !== "") return d[k];
    }
    return "";
  }

  function dv(data, ...keys) {
    const v = pick(data, ...keys);
    return v === "" ? "—" : esc(v);
  }

  /* Renders a table of {label, value} rows, skipping any row whose value
     resolves to nothing — keeps generated reports free of empty "—" rows
     for fields a particular officer didn't fill in. Pass skipEmpty:false
     to force a row to always show (e.g. mandatory fields). */
  function fieldRows(data, defs) {
    return defs.map(([label, ...keys]) => {
      const v = pick(data, ...keys);
      if (v === "") return "";
      return row(label, esc(v));
    }).join("");
  }

  /* Renders the verify_0..verify_N checklist objects ({status, remarks})
     that admin.html's field-verification widget writes into `data`. There's
     no stored label per item (the label lives in the form UI, not the DB),
     so items are numbered; any officer remarks are shown alongside. */
  function verifyChecklistRows(data) {
    const items = [];
    let i = 0;
    while (data && Object.prototype.hasOwnProperty.call(data, "verify_" + i)) {
      const v = data["verify_" + i] || {};
      const statusLabel = (v.status || "pending").replace(/^\w/, c => c.toUpperCase());
      const remarks = v.remarks ? ` — ${esc(v.remarks)}` : "";
      items.push(`<li>Verification Point ${i + 1}: <b>${esc(statusLabel)}</b>${remarks}</li>`);
      i++;
    }
    if (!items.length) return "";
    return `<ul style="font-size:11.5px; line-height:1.6; padding-left:18px; margin:0 0 14px; list-style:disc; columns:2; column-gap:24px;">${items.join("")}</ul>`;
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
     PAGED PDF EXPORT — renders a repeating letterhead header + products
     footer on EVERY page, with the document body sliced to fit between
     them. The body is paginated at element boundaries (never mid-line or
     mid-table-row): each direct child block of the body is measured, and
     if a block would cross the bottom margin it is pushed whole to the
     next page. Blocks taller than a full page (rare — e.g. a very long
     table) are recursively split at their own children's boundaries.
     --------------------------------------------------------------------- */
  async function exportHTMLToPDFPaged({ header, body, footer }, filename) {
    if (typeof window.html2canvas !== "function") {
      throw new Error("html2canvas failed to load. Please refresh the page and try again.");
    }
    if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") {
      throw new Error("jsPDF failed to load. Please refresh the page and try again.");
    }

    const RENDER_WIDTH = 780; // css px — same convention used across all SOLITAIRE PDFs
    const RENDER_SCALE = 2;

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "99998";
    overlay.style.background = "#ffffff";

    const stage = document.createElement("div");
    stage.style.position = "fixed";
    stage.style.top = "0";
    stage.style.left = "0";
    stage.style.zIndex = "99999";
    stage.style.background = "#ffffff";
    stage.style.width = RENDER_WIDTH + "px";

    document.body.appendChild(overlay);
    document.body.appendChild(stage);

    async function renderToCanvas(el) {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await window.html2canvas(el, {
        scale: RENDER_SCALE,
        useCORS: true,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });
      if (!canvas || !canvas.width || !canvas.height) {
        throw new Error("Render came back empty — nothing to put in the PDF. Try again after a full page refresh.");
      }
      return canvas;
    }

    async function renderHTMLToCanvas(html) {
      const div = document.createElement("div");
      div.style.width = RENDER_WIDTH + "px";
      div.style.background = "#ffffff";
      div.innerHTML = html;
      stage.appendChild(div);
      const canvas = await renderToCanvas(div);
      stage.removeChild(div);
      return canvas;
    }

    // Walks the box tree collecting break points (css-px offsets, relative
    // to `root`, where it is safe to start a new page) — i.e. the top edge
    // of every block that either fits standalone or has been split into
    // sub-blocks that do. Never returns an offset that falls inside text.
    function collectBreakOffsets(root, maxHeightCss) {
      const rootTop = root.getBoundingClientRect().top;
      const offsets = [0];

      function walk(el) {
        const kids = Array.from(el.children || []);
        if (!kids.length) return; // leaf — nothing finer to split on
        for (const kid of kids) {
          const r = kid.getBoundingClientRect();
          if (r.height > maxHeightCss) {
            walk(kid); // too tall on its own — descend for finer break points
          } else {
            offsets.push(r.top - rootTop);
          }
        }
      }
      walk(root);
      offsets.push(root.getBoundingClientRect().height);
      return Array.from(new Set(offsets.map(n => Math.round(n)))).sort((a, b) => a - b);
    }

    // Greedily packs the available break offsets into pages no taller than
    // maxHeightCss, always cutting exactly on a break offset.
    function paginate(breakOffsets, totalHeightCss, maxHeightCss) {
      const pages = [];
      let pageStart = 0;
      for (let i = 1; i < breakOffsets.length; i++) {
        const candidateEnd = breakOffsets[i];
        if (candidateEnd - pageStart > maxHeightCss) {
          const prevOffset = breakOffsets[i - 1];
          if (prevOffset === pageStart) {
            // Single block taller than a page and unsplittable — take it
            // alone rather than produce a zero-height page.
            pages.push([pageStart, candidateEnd]);
            pageStart = candidateEnd;
          } else {
            pages.push([pageStart, prevOffset]);
            pageStart = prevOffset;
          }
        }
      }
      if (pageStart < totalHeightCss) pages.push([pageStart, totalHeightCss]);
      return pages;
    }

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const [headerCanvas, footerCanvas] = [
        await renderHTMLToCanvas(header),
        await renderHTMLToCanvas(footer),
      ];

      const pdf = new window.jspdf.jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageWidthPt = pdf.internal.pageSize.getWidth();
      const pageHeightPt = pdf.internal.pageSize.getHeight();
      const ptPerCssPx = pageWidthPt / RENDER_WIDTH;

      const headerHeightPt = (headerCanvas.height / RENDER_SCALE) * ptPerCssPx;
      const footerHeightPt = (footerCanvas.height / RENDER_SCALE) * ptPerCssPx;
      const contentHeightPt = pageHeightPt - headerHeightPt - footerHeightPt;
      const contentHeightCssPx = contentHeightPt / ptPerCssPx;

      if (contentHeightCssPx <= 40) {
        throw new Error("Header/footer leave no room for content — check letterhead sizing.");
      }

      // Render body live in the stage so getBoundingClientRect() reflects
      // real layout, THEN screenshot it once we know the break points.
      const bodyDiv = document.createElement("div");
      bodyDiv.style.width = RENDER_WIDTH + "px";
      bodyDiv.style.background = "#ffffff";
      bodyDiv.innerHTML = body;
      stage.appendChild(bodyDiv);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const totalHeightCss = bodyDiv.getBoundingClientRect().height;
      const breakOffsets = collectBreakOffsets(bodyDiv, contentHeightCssPx);
      const pages = paginate(breakOffsets, totalHeightCss, contentHeightCssPx);

      const bodyCanvas = await renderToCanvas(bodyDiv);
      stage.removeChild(bodyDiv);

      const cssPxToCanvasPx = bodyCanvas.width / RENDER_WIDTH; // == RENDER_SCALE in practice

      const headerImg = headerCanvas.toDataURL("image/jpeg", 0.98);
      const footerImg = footerCanvas.toDataURL("image/jpeg", 0.98);
      const totalPages = Math.max(1, pages.length);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        const [startCss, endCss] = pages[i] || [0, 0];
        const sliceStartPx = Math.round(startCss * cssPxToCanvasPx);
        const sliceHeightPx = Math.max(1, Math.round((endCss - startCss) * cssPxToCanvasPx));

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = bodyCanvas.width;
        sliceCanvas.height = sliceHeightPx;
        const ctx = sliceCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(bodyCanvas, 0, sliceStartPx, bodyCanvas.width, sliceHeightPx, 0, 0, bodyCanvas.width, sliceHeightPx);
        const sliceImg = sliceCanvas.toDataURL("image/jpeg", 0.98);
        const sliceHeightPt = sliceHeightPx / cssPxToCanvasPx * ptPerCssPx;

        pdf.addImage(headerImg, "JPEG", 0, 0, pageWidthPt, headerHeightPt);
        pdf.addImage(sliceImg, "JPEG", 0, headerHeightPt, pageWidthPt, sliceHeightPt);
        pdf.addImage(footerImg, "JPEG", 0, pageHeightPt - footerHeightPt, pageWidthPt, footerHeightPt);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Page ${i + 1} of ${totalPages}`, pageWidthPt - 14, pageHeightPt - 5, { align: "right" });
      }

      pdf.save(filename);
      // Return the bytes too (base64) so callers can optionally also send
      // this exact PDF to the client — existing callers that don't use the
      // return value are unaffected.
      return { base64: pdf.output("datauristring").split(",")[1], filename };
    } finally {
      document.body.removeChild(stage);
      document.body.removeChild(overlay);
    }
  }

  /* ---------------------------------------------------------------------
     SEND TO CLIENT — uploads the just-generated PDF to private storage and
     asks the send-document Edge Function to deliver a branded deal-summary
     card (with a download button/link for that PDF) to the client's
     WhatsApp and/or email, whichever is on file. Any channel without
     WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID or RESEND_API_KEY
     configured in the project's Edge Function secrets comes back as
     status "skipped" / reason "not_configured" rather than throwing.
     --------------------------------------------------------------------- */
  async function sendDocumentToClient({ leadId, docType, docLabel, refNo, pdfBase64, filename, summary, clientName, recipientEmail, recipientPhone }) {
    const sb = window.SolitaireDB && window.SolitaireDB.sb;
    if (!sb) throw new Error("Not connected — supabase-config.js / auth-guard.js not loaded.");
    if (!recipientEmail && !recipientPhone) {
      return { ok: true, skipped: true, reason: "no_contact_on_file" };
    }
    const { data, error } = await sb.functions.invoke("send-document", {
      body: { leadId, docType, docLabel, refNo, pdfBase64, filename, summary, clientName, recipientEmail, recipientPhone },
    });
    if (error) throw error;
    return data;
  }

  /* Repeating header used by exportHTMLToPDFPaged — brand block + a
     constant reference line (invoice/ref no. + date), shown on every page. */
  function letterheadHeader(refLabel, refValue, dateStr) {
    return `
    <div style="font-family: Georgia, 'Times New Roman', serif; color:#1A1A1A; padding: 22px 36px 8px; background:#fff; box-sizing:border-box;">
      <div style="text-align:center; margin-bottom:6px;">
        <div style="font-family: Cambria, Georgia, serif; font-size:24px; font-weight:bold; letter-spacing:2px; color:#C9A227;">
          SOLITAIRE FINZ MART
        </div>
        <div style="font-size:10.5px; color:#555; font-style:italic; margin-top:2px;">
          LOAN DSA &nbsp;•&nbsp; FINANCIAL ADVISORY &nbsp;•&nbsp; ESTABLISHED SINCE 15+ YEARS
        </div>
        <div style="font-size:10.5px; color:#555; margin-top:2px;">
          Shop No. 8, Janaram Niwas, Thane–Bhiwandi Road, Bhiwandi, Thane, Maharashtra 421302 &nbsp;|&nbsp; sachinkale241981@gmail.com
        </div>
      </div>
      <div style="border-bottom:2px solid #C9A227; margin: 8px 0 8px;"></div>
      <div style="display:flex; justify-content:space-between; font-size:11.5px;">
        <div><b>${esc(refLabel)}:</b> ${esc(refValue)}</div>
        <div><b>Date:</b> ${esc(dateStr || todayDMY())}</div>
      </div>
    </div>`;
  }

  /* Repeating footer used by exportHTMLToPDFPaged — lists every product/
     service line so it's visible at the bottom of EVERY page, plus a
     closing note. Page number is stamped separately by the export fn. */
  function letterheadFooter(note) {
    return `
    <div style="font-family: Georgia, 'Times New Roman', serif; background:#fff; box-sizing:border-box; padding: 4px 36px 12px;">
      <div style="border-top:1px solid #C9A227; padding-top:6px; text-align:center;">
        <div style="font-size:9px; font-weight:bold; letter-spacing:.02em; color:#8A6D1F; line-height:1.5;">
          HOME LOANS &nbsp;·&nbsp; BUSINESS LOANS &nbsp;·&nbsp; LOAN AGAINST PROPERTY (LAP) &nbsp;·&nbsp; BALANCE TRANSFER<br/>
          CONSTRUCTION &amp; PROJECT FINANCE &nbsp;·&nbsp; OD / CC &nbsp;·&nbsp; COMMERCIAL PROPERTY LOANS
        </div>
        <div style="font-size:8.5px; font-style:italic; color:#777; margin-top:3px;">
          ${esc(note || "Solitaire Finz Mart, Bhiwandi, Thane, Maharashtra — this is a computer-generated document.")}
        </div>
      </div>
    </div>`;
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

  function describeSendResults(sendResult) {
    if (!sendResult) return "";
    if (sendResult.skipped) return "Client has no email or phone on file — nothing sent.";
    const parts = [];
    const label = { whatsapp: "WhatsApp", email: "Email" };
    for (const ch of ["whatsapp", "email"]) {
      const r = sendResult.results && sendResult.results[ch];
      if (!r) continue;
      if (r.status === "sent") parts.push(`sent to client on ${label[ch]}`);
      else if (r.status === "failed") parts.push(`${label[ch]} send failed (${r.reason || "error"})`);
      // "skipped" with reason "not_configured" or "no_contact_on_file" — stay quiet, nothing actionable for the associate.
    }
    return parts.length ? "Also " + parts.join(" and ") + "." : "";
  }

  return {
    parseLeadId, lnLabel, fetchLeadBundle, fetchEvaluationReport, esc, formatINR, amountInWords,
    todayDMY, fmtDMY, borrowerAddress, collateralAddress, pick, dv, fieldRows, verifyChecklistRows,
    exportHTMLToPDF, exportHTMLToPDFPaged, letterheadOpen, letterheadClose, letterheadHeader, letterheadFooter, row,
    sendDocumentToClient, describeSendResults,
  };
})();
