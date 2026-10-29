#!/usr/bin/env python
import streamlit as st

st.set_page_config(
    page_title='Micmac extendido',
    page_icon='🧭',
    layout='wide',
    initial_sidebar_state='collapsed')

from app import main

if __name__ == '__main__':
    main()
