from setuptools import setup

package_name = 'charmquark_edge'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools', 'websockets'],
    zip_safe=True,
    maintainer='CharmQuark Ops',
    maintainer_email='hello@charmquark.app',
    description='CharmQuark C2 Edge Client connecting ROS2 to the Cloudflare backend',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'client_node = charmquark_edge.client_node:main'
        ],
    },
)
