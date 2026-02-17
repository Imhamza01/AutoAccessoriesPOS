"""
REPORTS & ANALYTICS API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
import io
import os
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
except Exception:
    # ReportLab may not be installed in the environment; PDF endpoints will raise later
    A4 = None
    SimpleDocTemplate = None
    Table = None
    TableStyle = None
    Paragraph = None
    Spacer = None
    colors = None
    getSampleStyleSheet = None
    ParagraphStyle = None
    mm = None
from typing import Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager

router = APIRouter(prefix="/reports", tags=["reports"])
logger = logging.getLogger(__name__)


def _format_currency(value):
    try:
        return f"PKR {float(value):,.2f}"
    except Exception:
        return f"PKR {value}"


def _draw_header_footer(canvas, doc, shop_name, title, date_range):
    try:
        width, height = A4
    except Exception:
        width, height = 595.2756, 841.8898

    # Header
    canvas.saveState()
    # Attempt to draw logo left
    try:
        if hasattr(doc, 'logo_path') and doc.logo_path:
            logo_path = doc.logo_path
            if os.path.exists(logo_path):
                logo_w = 30 * mm
                logo_h = 30 * mm
                canvas.drawImage(logo_path, 30, height - 30 - logo_h, width=logo_w, height=logo_h, preserveAspectRatio=True, mask='auto')
    except Exception:
        pass

    canvas.setFont('Helvetica-Bold', 14)
    canvas.drawCentredString(width / 2.0, height - 36, shop_name)
    canvas.setFont('Helvetica', 10)
    canvas.drawCentredString(width / 2.0, height - 52, title)
    if date_range:
        canvas.setFont('Helvetica', 8)
        canvas.drawCentredString(width / 2.0, height - 66, date_range)

    # Footer - page number
    canvas.setFont('Helvetica', 8)
    page_num_text = f"Page {doc.page}"
    canvas.drawRightString(width - 30, 20, page_num_text)
    canvas.restoreState()


def _get_shop_info():
    """Return (shop_name, logo_path) from DB if available."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("SELECT shop_name, logo_path FROM shop_settings LIMIT 1")
            row = cur.fetchone()
            if row:
                shop = dict(row)
                shop_name = shop.get('shop_name') or 'Auto Accessories POS'
                logo_path = shop.get('logo_path')
                # If logo_path is relative, try to resolve under app data uploads
                if logo_path and not os.path.isabs(logo_path):
                    # attempt to find under DB manager app_data_path
                    try:
                        base = get_database_manager().app_data_path
                        candidate = os.path.join(str(base), 'uploads', logo_path)
                        if os.path.exists(candidate):
                            logo_path = candidate
                    except Exception:
                        pass
                return shop_name, logo_path
    except Exception:
        pass
    return 'Auto Accessories POS', None


def _short_datetime(val):
    """Normalize created_at values into shorter human-friendly string."""
    try:
        if not val:
            return ''
        s = str(val)
        # Try ISO parse
        try:
            dt = datetime.datetime.fromisoformat(s)
            return dt.strftime("%Y-%m-%d %H:%M")
        except Exception:
            # fallback to trimmed string
            return s[:19]
    except Exception:
        return str(val)


@router.get("/sales-summary", dependencies=[Depends(require_permission("reports.view"))])
async def sales_summary(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get sales summary for date range."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Daily sales
            query = """
                SELECT DATE(created_at) as date, COUNT(*) as transactions,
                       SUM(grand_total) as revenue, SUM(gst_amount) as gst
                FROM sales WHERE sale_status != 'cancelled'
            """
            params = []
            
            if start_date:
                query += " AND created_at >= ?"
                params.append(start_date)
            if end_date:
                query += " AND created_at <= ?"
                params.append(end_date)
            
            # Use DATE(created_at) for grouping
            query += " GROUP BY DATE(created_at) ORDER BY MAX(created_at) DESC"
            
            cur.execute(query, params)
            daily_sales = cur.fetchall()
            
            # Total metrics
            metrics_query = "SELECT COUNT(*), SUM(grand_total), SUM(gst_amount) FROM sales WHERE sale_status != 'cancelled'"
            metrics_params = []
            if start_date:
                metrics_query += " AND created_at >= ?"
                metrics_params.append(start_date)
            if end_date:
                metrics_query += " AND created_at <= ?"
                metrics_params.append(end_date)
            
            cur.execute(metrics_query, metrics_params)
            metrics = cur.fetchone()
        
        return {
            "success": True,
            "metrics": {
                "total_transactions": metrics[0] or 0,
                "total_revenue": metrics[1] or 0,
                "total_gst": metrics[2] or 0
            },
            "daily_sales": [
                {
                    "date": d[0],
                    "transactions": d[1],
                    "revenue": d[2],
                    "gst": d[3]
                }
                for d in daily_sales
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get sales summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-products", dependencies=[Depends(require_permission("reports.view"))])
async def top_products(
    limit: int = Query(10),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get top selling products by quantity and revenue."""
    try:
        db = get_database_manager()
        if not db:
            raise HTTPException(status_code=500, detail="Database connection failed")
            
        with db.get_cursor() as cur:
            if not cur:
                raise HTTPException(status_code=500, detail="Database cursor failed")
            query = """
                SELECT p.id, p.name, SUM(si.quantity) as qty_sold,
                       SUM(si.total_price) as revenue
                FROM sale_items si
                JOIN products p ON si.product_id = p.id
            """
            params = []
            
            if start_date:
                query += " AND si.created_at >= ?"
                params.append(start_date)
            if end_date:
                query += " AND si.created_at <= ?"
                params.append(end_date)
            
            query += f" GROUP BY p.id ORDER BY qty_sold DESC LIMIT ?"
            params.append(limit)
            
            cur.execute(query, params)
            products = cur.fetchall()
        
        return {
            "success": True,
            "top_products": [
                {
                    "product_id": p[0],
                    "name": p[1],
                    "quantity_sold": p[2],
                    "revenue": p[3]
                }
                for p in products
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get top products: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/customer-sales", dependencies=[Depends(require_permission("reports.view"))])
async def customer_sales(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get sales by customer."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = """
                SELECT c.id, c.full_name, COUNT(*) as transactions,
                       SUM(s.grand_total) as total_spent
                FROM sales s
                LEFT JOIN customers c ON s.customer_id = c.id
            """
            params = []
            
            if start_date:
                query += " AND DATE(s.created_at) >= ?"
                params.append(start_date)
            if end_date:
                query += " AND DATE(s.created_at) <= ?"
                params.append(end_date)
            
            query += " GROUP BY c.id ORDER BY total_spent DESC"
            
            cur.execute(query, params)
            customers = cur.fetchall()
        
        return {
            "success": True,
            "customer_sales": [
                {
                    "customer_id": c[0],
                    "customer_name": c[1],
                    "transactions": c[2],
                    "total_spent": c[3]
                }
                for c in customers
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get customer sales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gst-report", dependencies=[Depends(require_permission("reports.view"))])
async def gst_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get GST report for tax filing."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Sales with GST
            query = """
                SELECT DATE(created_at) as date, COUNT(*) as invoices,
                       SUM(subtotal) as taxable_amount, SUM(gst_amount) as gst
                FROM sales
                WHERE gst_amount > 0 AND sale_status != 'cancelled'
            """
            params = []
            
            if start_date:
                query += " AND created_at >= ?"
                params.append(start_date)
            if end_date:
                query += " AND created_at <= ?"
                params.append(end_date)
            
            query += " GROUP BY DATE(created_at) ORDER BY date DESC"
            
            cur.execute(query, params)
            gst_sales = cur.fetchall()
            
            # Total GST
            total_query = "SELECT SUM(gst_amount) FROM sales WHERE gst_amount > 0 AND sale_status != 'cancelled'"
            total_params = []
            if start_date:
                total_query += " AND created_at >= ?"
                total_params.append(start_date)
            if end_date:
                total_query += " AND created_at <= ?"
                total_params.append(end_date)
            
            cur.execute(total_query, total_params)
            total_gst = cur.fetchone()[0] or 0
        
        return {
            "success": True,
            "total_gst": total_gst,
            "gst_summary": [
                {
                    "date": g[0],
                    "invoices": g[1],
                    "taxable_amount": g[2],
                    "gst": g[3]
                }
                for g in gst_sales
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get GST report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profit-loss", dependencies=[Depends(require_permission("reports.view"))])
async def profit_loss_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get profit and loss statement."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Total revenue
            rev_query = "SELECT SUM(grand_total) FROM sales WHERE sale_status != 'cancelled'"
            rev_params = []
            if start_date:
                rev_query += " AND created_at >= ?"
                rev_params.append(start_date)
            if end_date:
                rev_query += " AND created_at <= ?"
                rev_params.append(end_date)
            
            cur.execute(rev_query, rev_params)
            revenue = cur.fetchone()[0] or 0
            
            # Total expenses
            exp_query = "SELECT SUM(amount) FROM expenses"
            exp_params = []
            if start_date:
                exp_query += " AND created_at >= ?"
                exp_params.append(start_date)
            if end_date:
                exp_query += " AND created_at <= ?"
                exp_params.append(end_date)
            
            cur.execute(exp_query, exp_params)
            expenses = cur.fetchone()[0] or 0
            
            # Calculate profit
            profit = revenue - expenses
            profit_margin = (profit / revenue * 100) if revenue > 0 else 0
        
        return {
            "success": True,
            "period": {
                "start_date": start_date,
                "end_date": end_date
            },
            "revenue": revenue,
            "expenses": expenses,
            "profit": profit,
            "profit_margin_percent": round(profit_margin, 2)
        }
    except Exception as e:
        logger.error(f"Failed to get P&L report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate profit and loss report")


@router.get("/sales-pdf", dependencies=[Depends(require_permission("reports.view"))])
async def sales_pdf(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Generate professional sales report PDF."""
    if SimpleDocTemplate is None:
        raise HTTPException(status_code=500, detail="ReportLab is not installed on the server")

    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = """
                SELECT s.created_at,
                       COALESCE(c.full_name, s.customer_id) as customer,
                       s.grand_total, s.gst_amount, s.payment_method, s.payment_status, s.cashier_name, s.invoice_number
                FROM sales s
                LEFT JOIN customers c ON s.customer_id = c.id
                WHERE s.sale_status != 'cancelled'
            """
            params = []
            if start_date:
                query += " AND DATE(s.created_at) >= ?"
                params.append(start_date)
            if end_date:
                query += " AND DATE(s.created_at) <= ?"
                params.append(end_date)
            query += " ORDER BY s.created_at DESC"
            cur.execute(query, params)
            rows = cur.fetchall()

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=20, leftMargin=20, topMargin=20, bottomMargin=30)
        elements = []
        styles = getSampleStyleSheet()
        
        # Professional Colors
        PRIMARY_COLOR = colors.HexColor("#2C3E50")  # Dark Blue/Grey
        ACCENT_COLOR = colors.HexColor("#34495E")   # Slightly lighter
        HEADER_BG = colors.HexColor("#ECF0F1")      # Light Grey for headers
        
        shop_name, logo_path = _get_shop_info()
        title = "SALES REPORT"
        date_range = f"Period: {start_date or 'Start'} to {end_date or 'Present'}"

        # --- Professional Header ---
        # We will use a Table for the header to align things perfectly
        header_data = [
            [shop_name, title],
            ["Auto Parts & Accessories", date_range],
            [datetime.datetime.now().strftime("Generated: %Y-%m-%d %H:%M"), f"Total Records: {len(rows)}"]
        ]
        
        header_table = Table(header_data, colWidths=[doc.width/2.0, doc.width/2.0])
        header_table.setStyle(TableStyle([
            ('FONTNAME', (0,0), (0,0), 'Helvetica-Bold'), # Shop Name
            ('FONTSIZE', (0,0), (0,0), 18),
            ('TEXTCOLOR', (0,0), (0,0), PRIMARY_COLOR),
            
            ('FONTNAME', (1,0), (1,0), 'Helvetica-Bold'), # Report Title
            ('FONTSIZE', (1,0), (1,0), 16),
            ('ALIGN', (1,0), (1,-1), 'RIGHT'),
            ('TEXTCOLOR', (1,0), (1,0), colors.grey),
            
            ('FONTSIZE', (0,1), (-1,-1), 10),
            ('TEXTCOLOR', (0,1), (-1,-1), colors.darkgrey),
            ('BOTTOMPADDING', (0,-1), (-1,-1), 10),
            ('LINEBELOW', (0,-1), (-1,-1), 1, PRIMARY_COLOR),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 15))

        # --- Summary Section ---
        total_revenue = sum(float(r[2] or 0) for r in rows)
        total_gst = sum(float(r[3] or 0) for r in rows)
        avg_sale = total_revenue / len(rows) if rows else 0
        
        summary_data = [
            ['Total Revenue', 'Total GST', 'Transactions', 'Avg. Sale Value'],
            [_format_currency(total_revenue), _format_currency(total_gst), str(len(rows)), _format_currency(avg_sale)]
        ]
        
        summary_table = Table(summary_data, colWidths=[doc.width/4.0]*4)
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), ACCENT_COLOR),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 10),
            ('BOTTOMPADDING', (0,0), (-1,0), 8),
            ('TOPPADDING', (0,0), (-1,0), 8),
            
            ('BACKGROUND', (0,1), (-1,1), HEADER_BG),
            ('FONTNAME', (0,1), (-1,1), 'Helvetica-Bold'),
            ('FONTSIZE', (0,1), (-1,1), 11),
            ('TEXTCOLOR', (0,1), (-1,1), PRIMARY_COLOR),
            ('BOTTOMPADDING', (0,1), (-1,1), 10),
            ('TOPPADDING', (0,1), (-1,1), 10),
            ('GRID', (0,0), (-1,-1), 0.5, colors.white),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 20))

        # --- Data Table ---
        # Headers: Date, Invoice #, Customer, Payment, Status, GST, Amount
        data = [["Date", "Invoice", "Customer", "Payment", "Status", "GST", "Total"]]
        
        table_style = TableStyle([
            # Header Row
            ('BACKGROUND', (0,0), (-1,0), PRIMARY_COLOR),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('ALIGN', (0,0), (-1,0), 'CENTER'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 9),
            ('BOTTOMPADDING', (0,0), (-1,0), 8),
            ('TOPPADDING', (0,0), (-1,0), 8),
            
            # Data Rows
            ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
            ('FONTSIZE', (0,1), (-1,-1), 8),
            ('ALIGN', (5,1), (6,-1), 'RIGHT'), # GST and Total align right
            ('ALIGN', (0,1), (0,-1), 'CENTER'), # Date center
            ('GRID', (0,0), (-1,-1), 0.5, colors.lightgrey),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ])

        # Prepare data rows
        row_colors = [colors.white, colors.HexColor("#F8F9F9")] # Alternating colors
        
        for i, r in enumerate(rows):
            created_raw = r[0] or ''
            created = _short_datetime(created_raw).split(' ')[0] # Just date
            customer = r[1] or 'Guest'
            total = float(r[2] or 0)
            gst = float(r[3] or 0)
            payment = (r[4] or '').title()
            status = (r[5] or '').title()
            invoice = r[7] or '' # Added invoice number to query
            
            # Truncate customer name if too long
            if len(customer) > 20:
                customer = customer[:18] + ".."
            
            data.append([
                created,
                invoice,
                customer,
                payment,
                status,
                f"{gst:,.0f}", # Simplified formatting for table
                f"{total:,.0f}"
            ])
            
            # Row styling for alternating colors
            bg_color = row_colors[i % 2]
            table_style.add('BACKGROUND', (0, i+1), (-1, i+1), bg_color)

        # Columns: Date(12%), Invoice(15%), Customer(25%), Payment(10%), Status(10%), GST(10%), Total(18%)
        col_widths = [
            doc.width * 0.12,
            doc.width * 0.18,
            doc.width * 0.25,
            doc.width * 0.10,
            doc.width * 0.10,
            doc.width * 0.10,
            doc.width * 0.15
        ]
        
        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(table_style)
        elements.append(t)

        # Build
        doc.build(elements)
        buffer.seek(0)
        filename = f"sales_report_{datetime.datetime.now().strftime('%Y%m%d')}.pdf"
        return StreamingResponse(buffer, media_type='application/pdf', headers={"Content-Disposition": f"attachment; filename={filename}"})
    except Exception as e:
        logger.error(f"Failed to generate sales PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/inventory-pdf", dependencies=[Depends(require_permission("reports.view"))])
async def inventory_pdf(current_user: Dict[str, Any] = Depends(get_current_user)):
    if SimpleDocTemplate is None:
        raise HTTPException(status_code=500, detail="ReportLab is not installed on the server")
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("SELECT id, name, sku, current_stock, cost_price FROM products ORDER BY current_stock * cost_price DESC")
            products = cur.fetchall()

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=80, bottomMargin=40)
        elements = []
        styles = getSampleStyleSheet()
        title = 'Inventory Valuation'
        shop_name, logo_path = _get_shop_info()
        elements.append(Paragraph(title, styles['Heading2']))
        elements.append(Spacer(1,12))

        data = [["Product", "SKU", "Stock", "Cost", "Value"]]
        total_value = 0.0
        for p in products:
            pid = p[0]
            name = p[1] or ''
            sku = p[2] or ''
            stock = float(p[3] or 0)
            cost = float(p[4] or 0)
            value = stock * cost
            total_value += value
            data.append([str(name), str(sku), str(int(stock)), _format_currency(cost), _format_currency(value)])

        try:
            avail_width = A4[0] - doc.leftMargin - doc.rightMargin
            col_widths = [avail_width * w for w in (0.40, 0.15, 0.15, 0.15, 0.15)]
            tbl = Table(data, colWidths=col_widths, repeatRows=1)
        except Exception:
            tbl = Table(data, repeatRows=1)
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#16a085')),
            ('TEXTCOLOR',(0,0),(-1,0),colors.white),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
            ('ALIGN', (2,1), (4,-1), 'RIGHT')
        ]))
        elements.append(tbl)
        elements.append(Spacer(1,12))
        elements.append(Paragraph(f"Total Inventory Value: {_format_currency(total_value)}", styles['Normal']))

        try:
            doc.logo_path = logo_path
        except Exception:
            doc.logo_path = None

        doc.build(elements, onFirstPage=lambda c,d: _draw_header_footer(c, d, shop_name, title, None), onLaterPages=lambda c,d: _draw_header_footer(c, d, shop_name, title, None))
        buffer.seek(0)
        return StreamingResponse(buffer, media_type='application/pdf', headers={"Content-Disposition": "attachment; filename=inventory_valuation.pdf"})
    except Exception as e:
        logger.error(f"Failed to generate inventory PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gst-pdf", dependencies=[Depends(require_permission("reports.view"))])
async def gst_pdf(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    if SimpleDocTemplate is None:
        raise HTTPException(status_code=500, detail="ReportLab is not installed on the server")
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # omit invoice_number from GST PDF per request
            query = "SELECT created_at, subtotal, gst_amount FROM sales WHERE gst_amount > 0 AND sale_status != 'cancelled'"
            params = []
            if start_date:
                query += " AND DATE(created_at) >= ?"
                params.append(start_date)
            if end_date:
                query += " AND DATE(created_at) <= ?"
                params.append(end_date)
            query += " ORDER BY created_at DESC"
            cur.execute(query, params)
            rows = cur.fetchall()

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=80, bottomMargin=40)
        elements = []
        styles = getSampleStyleSheet()
        title = 'GST Report'
        shop_name, logo_path = _get_shop_info()
        range_text = f"From: {start_date or 'Beginning'} To: {end_date or 'Now'}"
        elements.append(Paragraph(title, styles['Heading2']))
        elements.append(Paragraph(range_text, styles['Normal']))
        elements.append(Spacer(1,12))

        data = [["Date", "Taxable", "GST"]]
        total_taxable = 0.0
        total_gst = 0.0
        small_style = ParagraphStyle('table_small', parent=styles['Normal'], fontSize=9, leading=11)
        for r in rows:
            created = _short_datetime(r[0] or '')
            taxable = float(r[1] or 0)
            gst = float(r[2] or 0)
            total_taxable += taxable
            total_gst += gst
            data.append([Paragraph(created, small_style), Paragraph(_format_currency(taxable), small_style), Paragraph(_format_currency(gst), small_style)])

        try:
            avail_width = A4[0] - doc.leftMargin - doc.rightMargin
            col_widths = [avail_width * w for w in (0.45, 0.27, 0.28)]
            tbl = Table(data, colWidths=col_widths, repeatRows=1)
        except Exception:
            tbl = Table(data, repeatRows=1)
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#16a085')),
            ('TEXTCOLOR',(0,0),(-1,0),colors.white),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
            ('FONTSIZE', (0,0), (-1, -1), 9),
            ('LEFTPADDING', (0,0), (-1,-1), 6),
            ('RIGHTPADDING', (0,0), (-1,-1), 6),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('ALIGN', (1,1), (2,-1), 'RIGHT')
        ]))
        elements.append(tbl)
        elements.append(Spacer(1,12))
        elements.append(Paragraph(f"Total Taxable Amount: {_format_currency(total_taxable)}", styles['Normal']))
        elements.append(Paragraph(f"Total GST: {_format_currency(total_gst)}", styles['Normal']))

        try:
            doc.logo_path = logo_path
        except Exception:
            doc.logo_path = None

        doc.build(elements, onFirstPage=lambda c,d: _draw_header_footer(c, d, shop_name, title, range_text), onLaterPages=lambda c,d: _draw_header_footer(c, d, shop_name, title, range_text))
        buffer.seek(0)
        return StreamingResponse(buffer, media_type='application/pdf', headers={"Content-Disposition": "attachment; filename=gst_report.pdf"})
    except Exception as e:
        logger.error(f"Failed to generate GST PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profit-loss-pdf", dependencies=[Depends(require_permission("reports.view"))])
async def profit_loss_pdf(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    if SimpleDocTemplate is None:
        raise HTTPException(status_code=500, detail="ReportLab is not installed on the server")
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            rev_query = "SELECT SUM(grand_total) FROM sales WHERE sale_status != 'cancelled'"
            rev_params = []
            if start_date:
                rev_query += " AND DATE(created_at) >= ?"
                rev_params.append(start_date)
            if end_date:
                rev_query += " AND DATE(created_at) <= ?"
                rev_params.append(end_date)
            cur.execute(rev_query, rev_params)
            revenue = cur.fetchone()[0] or 0

            exp_query = "SELECT SUM(amount) FROM expenses WHERE 1=1"
            exp_params = []
            if start_date:
                exp_query += " AND DATE(created_at) >= ?"
                exp_params.append(start_date)
            if end_date:
                exp_query += " AND DATE(created_at) <= ?"
                exp_params.append(end_date)
            cur.execute(exp_query, exp_params)
            expenses = cur.fetchone()[0] or 0

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=80, bottomMargin=40)
        elements = []
        styles = getSampleStyleSheet()
        title = 'Profit & Loss Report'
        shop_name, logo_path = _get_shop_info()
        range_text = f"Period: {start_date or 'Beginning'} - {end_date or 'Now'}"
        elements.append(Paragraph(title, styles['Heading2']))
        elements.append(Spacer(1,12))
        elements.append(Paragraph(range_text, styles['Normal']))
        elements.append(Spacer(1,12))
        elements.append(Paragraph(f"Total Revenue: {_format_currency(revenue)}", styles['Normal']))
        elements.append(Paragraph(f"Total Expenses: {_format_currency(expenses)}", styles['Normal']))
        profit = revenue - expenses
        elements.append(Paragraph(f"Profit: {_format_currency(profit)}", styles['Normal']))
        profit_margin = (profit / revenue * 100) if revenue > 0 else 0
        elements.append(Paragraph(f"Profit Margin: {round(profit_margin,2)}%", styles['Normal']))

        try:
            doc.logo_path = logo_path
        except Exception:
            doc.logo_path = None

        doc.build(elements, onFirstPage=lambda c,d: _draw_header_footer(c, d, shop_name, title, range_text), onLaterPages=lambda c,d: _draw_header_footer(c, d, shop_name, title, range_text))
        buffer.seek(0)
        return StreamingResponse(buffer, media_type='application/pdf', headers={"Content-Disposition": "attachment; filename=profit_loss_report.pdf"})
    except Exception as e:
        logger.error(f"Failed to generate P&L PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard-analytics", dependencies=[Depends(require_permission("reports.view"))])
async def dashboard_analytics(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get dashboard analytics with today vs yesterday comparison."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Get today and yesterday dates
            from datetime import datetime, timedelta
            today = datetime.now().date()
            yesterday = today - timedelta(days=1)
            
            # Today's sales
            cur.execute("""
                SELECT COUNT(*) as transactions, SUM(grand_total) as total_sales,
                       COUNT(DISTINCT customer_id) as unique_customers
                FROM sales 
                WHERE DATE(created_at) = ? AND sale_status != 'cancelled'
            """, (today,))
            today_data = cur.fetchone()
            
            # Yesterday's sales
            cur.execute("""
                SELECT COUNT(*) as transactions, SUM(grand_total) as total_sales,
                       COUNT(DISTINCT customer_id) as unique_customers
                FROM sales 
                WHERE DATE(created_at) = ? AND sale_status != 'cancelled'
            """, (yesterday,))
            yesterday_data = cur.fetchone()
            
            # Calculate metrics
            today_sales = today_data[1] or 0
            yesterday_sales = yesterday_data[1] or 0
            today_transactions = today_data[0] or 0
            yesterday_transactions = yesterday_data[0] or 0
            today_customers = today_data[2] or 0
            yesterday_customers = yesterday_data[2] or 0
            
            # Calculate percentage changes
            sales_change = ((today_sales - yesterday_sales) / yesterday_sales * 100) if yesterday_sales > 0 else 0
            customer_change = ((today_customers - yesterday_customers) / yesterday_customers * 100) if yesterday_customers > 0 else 0
            
            # Average bill values
            avg_bill_today = (today_sales / today_transactions) if today_transactions > 0 else 0
            avg_bill_yesterday = (yesterday_sales / yesterday_transactions) if yesterday_transactions > 0 else 0
            avg_bill_change = ((avg_bill_today - avg_bill_yesterday) / avg_bill_yesterday * 100) if avg_bill_yesterday > 0 else 0
            
        return {
            "success": True,
            "today": {
                "sales": today_sales,
                "transactions": today_transactions,
                "customers": today_customers,
                "avg_bill": avg_bill_today
            },
            "yesterday": {
                "sales": yesterday_sales,
                "transactions": yesterday_transactions,
                "customers": yesterday_customers,
                "avg_bill": avg_bill_yesterday
            },
            "changes": {
                "sales_percent": round(sales_change, 1),
                "customers_percent": round(customer_change, 1),
                "avg_bill_percent": round(avg_bill_change, 1)
            }
        }
    except Exception as e:
        logger.error(f"Failed to get dashboard analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/inventory-valuation", dependencies=[Depends(require_permission("reports.view"))])
async def inventory_valuation(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get total inventory valuation."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                SELECT SUM(current_stock * cost_price) as total_value,
                       SUM(current_stock) as total_units
                FROM products
            """)
            result = cur.fetchone()
        
        return {
            "success": True,
            "total_inventory_value": result[0] or 0,
            "total_units": result[1] or 0
        }
    except Exception as e:
        logger.error(f"Failed to get inventory valuation: {e}")
        raise HTTPException(status_code=500, detail="Failed to get inventory valuation")


@router.get("/sales-by-category", dependencies=[Depends(require_permission("reports.view"))])
async def sales_by_category(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get sales breakdown by product category."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = """
                SELECT c.name as category, SUM(si.quantity) as quantity_sold,
                       SUM(si.total_price) as revenue
                FROM sale_items si
                JOIN products p ON si.product_id = p.id
                JOIN categories c ON p.category_id = c.id
                WHERE 1=1
            """
            params = []
            
            if start_date:
                query += " AND si.created_at >= ?"
                params.append(start_date)
            if end_date:
                query += " AND si.created_at <= ?"
                params.append(end_date)
            
            query += " GROUP BY c.id ORDER BY revenue DESC"
            
            cur.execute(query, params)
            category_sales = cur.fetchall()
        
        return {
            "success": True,
            "category_sales": [
                {
                    "category": c[0],
                    "quantity_sold": c[1],
                    "revenue": c[2]
                }
                for c in category_sales
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get sales by category: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/payment-methods", dependencies=[Depends(require_permission("reports.view"))])
async def payment_methods(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get sales breakdown by payment method."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = """
                SELECT payment_method, COUNT(*) as transactions,
                       SUM(grand_total) as total_amount
                FROM sales
                WHERE sale_status != 'cancelled'
            """
            params = []
            
            if start_date:
                query += " AND created_at >= ?"
                params.append(start_date)
            if end_date:
                query += " AND created_at <= ?"
                params.append(end_date)
            
            query += " GROUP BY payment_method ORDER BY total_amount DESC"
            
            cur.execute(query, params)
            payment_methods = cur.fetchall()
        
        return {
            "success": True,
            "payment_methods": [
                {
                    "method": pm[0],
                    "transactions": pm[1],
                    "total_amount": pm[2]
                }
                for pm in payment_methods
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get payment methods: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/credit-summary", dependencies=[Depends(require_permission("reports.view"))])
async def credit_summary(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get credit summary for all customers with outstanding balances."""
    try:
        db = get_database_manager()
        if not db:
            raise HTTPException(status_code=500, detail="Database connection failed")
            
        with db.get_cursor() as cur:
            if not cur:
                raise HTTPException(status_code=500, detail="Database cursor failed")
                
            # Get customers with outstanding credit
            query = """
                SELECT c.id, c.full_name, c.phone, c.credit_limit, c.current_balance,
                       (SELECT COUNT(*) FROM sales WHERE customer_id = c.id AND payment_status = 'pending') as pending_invoices
                FROM customers c
                WHERE c.current_balance > 0
                ORDER BY c.current_balance DESC
            """
            
            try:
                cur.execute(query)
                raw_customers = cur.fetchall()
            except Exception as query_error:
                logger.error(f"Query execution failed: {query_error}")
                logger.error(f"Query: {query}")
                raise HTTPException(status_code=500, detail=f"Database query failed: {str(query_error)}")
            
            customers = []
            for row in raw_customers:
                if hasattr(row, 'keys'):
                    customers.append(dict(row))
                else:
                    customers.append(row)
            
            # Get total outstanding credit
            try:
                cur.execute("SELECT SUM(current_balance) FROM customers WHERE current_balance > 0")
                total_outstanding_result = cur.fetchone()
                total_outstanding = total_outstanding_result[0] if total_outstanding_result and total_outstanding_result[0] is not None else 0
            except Exception as sum_error:
                logger.error(f"Sum query failed: {sum_error}")
                total_outstanding = 0
            
            # Get total credit limit granted
            try:
                cur.execute("SELECT SUM(credit_limit) FROM customers")
                total_credit_limit_result = cur.fetchone()
                total_credit_limit = total_credit_limit_result[0] if total_credit_limit_result and total_credit_limit_result[0] is not None else 0
            except Exception as limit_error:
                logger.error(f"Credit limit query failed: {limit_error}")
                total_credit_limit = 0
            
        return {
            "success": True,
            "total_outstanding_credit": float(total_outstanding),
            "total_credit_limit": float(total_credit_limit),
            "customers_with_credit": [
                {
                    "customer_id": c[0],
                    "name": c[1],
                    "phone": c[2],
                    "credit_limit": float(c[3]),
                    "outstanding_balance": float(c[4]),
                    "pending_invoices": c[5]
                }
                for c in customers
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get credit summary: {e}")
        logger.exception("Full traceback:")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending-credit", dependencies=[Depends(require_permission("reports.view"))])
async def pending_credit(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get pending credit sales for dashboard."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Get pending credit sales
            cur.execute("""
                SELECT s.id, s.invoice_number, c.full_name as customer_name, 
                       s.grand_total, s.created_at
                FROM sales s
                JOIN customers c ON s.customer_id = c.id
                WHERE s.payment_status = 'pending'
                ORDER BY s.created_at DESC
                LIMIT 10
            """)
            pending_sales = cur.fetchall()
            
            # Get total pending amount
            cur.execute("""
                SELECT SUM(grand_total) 
                FROM sales 
                WHERE payment_status = 'pending'
            """)
            total_pending = cur.fetchone()[0] or 0
            
        return {
            "success": True,
            "total_pending_amount": total_pending,
            "pending_sales": [
                {
                    "sale_id": s[0],
                    "invoice_number": s[1],
                    "customer_name": s[2],
                    "amount": s[3],
                    "date": s[4]
                }
                for s in pending_sales
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get pending credit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


