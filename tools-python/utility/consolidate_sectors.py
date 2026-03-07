#!/usr/bin/env python3
"""
Sector Consolidation Tool
Consolidates 47 sectors down to 14 manageable categories.
"""

import os
import sys
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'database': 'jobtrack',
    'user': 'marklewis',
    'password': ''
}

# Sector consolidation mapping
# Format: 'New Sector Name': [list of old sector names to merge]
SECTOR_MAPPING = {
    'Recruitment & Executive Search': [
        'Executive Search',
        'Recruitment',
        'Recruitment & Tech Services',
        'Tech Education & Recruitment',
        'Tech Training & Placement'
    ],
    'Banking & Financial Services': [
        'Banking & Finance',
        'Investment Banking',
        'Banking & Investment',
        'Banking',
        'Banking & Fintech'
    ],
    'Investment & Asset Management': [
        'Investment Management',
        'Investment Services',
        'Insurance & Asset Mgmt',
